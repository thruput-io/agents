import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, test as it, mock } from "node:test";
import { z } from "zod";
import { AccessToken } from "../domain/access-token.ts";
import { GithubPullRequest } from "../domain/code-under-review.ts";
import type { Change, Ledger, Outcome, Row } from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import type {
	AdapterResolution,
	HostAdapter,
	HostAdapterPort,
} from "../io/host-adapter.ts";
import { CodeUnderReviewSnapshot } from "../io/review-snapshot.ts";
import { Workdir } from "../io/workdir.ts";
import { MainAgentController } from "./controller.ts";

const HEAD_COMMIT = "1111111111111111111111111111111111111111";

const rootDir = mkdtempSync(join(tmpdir(), "pr-review-controller-unit-"));
let counter = 0;

const freshWorkdir = (): Workdir => {
	counter += 1;
	return nonnull(Workdir.from(join(rootDir, `case-${counter}`)).data);
};

const sampleHost = {
	kind: "github",
	owner: "octocat",
	repository: "hello-world",
	number: 42,
} as const;

const sampleSnapshot = () =>
	nonnull(GithubPullRequest.from(sampleHost).data).withReview(
		[
			{
				path: "a.ts",
				fragments: [
					{
						kind: "surface",
						side: "head",
						lines: [
							{
								idToReportViolationOn: "a.ts:1",
								text: "export const a = 1;",
							},
						],
					},
				],
			},
		],
		[],
		{ threads: [] },
	);

const sampleChange = (): Change => ({
	host: sampleHost,
	author: "author@example.com",
	description: "Refactor helper",
});

const stubAdapter = (
	resolution: AdapterResolution,
	postResult: Awaited<ReturnType<HostAdapter["post"]>> = "local://submitted",
): HostAdapter => ({
	host: () => sampleHost,
	resolve: () => Promise.resolve(resolution),
	post: () => Promise.resolve(postResult),
});

const okAdapterParse = (
	adapter: HostAdapter,
): z.ZodSafeParseResult<HostAdapter> =>
	z.custom<HostAdapter>().safeParse(adapter);

const createStubPort = (
	resolveAdapter: (url: string) => z.ZodSafeParseResult<HostAdapter>,
	adapterForRehydrate = stubAdapter({
		kind: "already-reviewed",
		headCommit: HEAD_COMMIT,
		location: "local://stub",
	}),
): HostAdapterPort => {
	const pullRequest = sampleSnapshot();
	return {
		from: resolveAdapter,
		fromWithToken: resolveAdapter,
		rehydrate: () => ({ pullRequest, adapter: adapterForRehydrate }),
		rehydrateWithToken: () => ({ pullRequest, adapter: adapterForRehydrate }),
	};
};

const mockBookFetch = () =>
	mock.method(
		globalThis,
		"fetch",
		async () => new Response("# Book Rules\n\n## R1\n", { status: 200 }),
	);

const stubPassingRowsForAudit = (auditDoc: Record<string, unknown>): Row[] => {
	const contextRulesets = z
		.object({
			kind: z.literal("context"),
			rulesets: z.array(z.object({ url: z.string().url() })),
		})
		.safeParse(auditDoc);
	const rulebookProbe = z
		.object({
			ruleset: z.object({
				rules: z.array(z.object({ id: z.string().min(1) })),
			}),
		})
		.safeParse(auditDoc);
	const builders: Readonly<Record<string, () => Row[]>> = {
		true: () => {
			const firstUrl = nonnull(nonnull(contextRulesets.data).rulesets[0]).url;
			return [
				{
					bookRule: { ruleset: firstUrl, heading: "R1" },
					examined: ["a.ts"],
					verdict: "clean",
					evidence: "Clean",
				},
			];
		},
		false: () =>
			nonnull(rulebookProbe.data).ruleset.rules.map((rule) => ({
				rule: rule.id,
				examined: ["a.ts"],
				verdict: "clean",
				evidence: "Clean",
			})),
	};
	return nonnull(builders[String(contextRulesets.success)])();
};

afterEach(() => {
	mock.restoreAll();
});

after(() => {
	rmSync(rootDir, { recursive: true, force: true });
});

it("MainAgentController.prepare returns invalid-target when HostAdapterPort rejects the target", async () => {
	const port = createStubPort((url) =>
		z
			.url()
			.transform(() =>
				stubAdapter({
					kind: "already-reviewed",
					headCommit: HEAD_COMMIT,
					location: "local://stub",
				}),
			)
			.safeDecode(url),
	);
	const controller = MainAgentController.create(port);
	const result = await controller.prepare("not-a-target", freshWorkdir());
	assert.equal(result.success, false);
	assert.equal(result.error.kind, "invalid-target");
});

it("MainAgentController.prepare forwards non-ready adapter resolutions without persisting pull-request state", async () => {
	const workdir = freshWorkdir();
	const port = createStubPort(() =>
		okAdapterParse(
			stubAdapter({
				kind: "already-reviewed",
				headCommit: HEAD_COMMIT,
				location: "https://github.com/org/repo/pull/1#review-1",
			}),
		),
	);
	const controller = MainAgentController.create(port);
	const result = await controller.prepare(
		"https://github.com/org/repo/pull/1",
		workdir,
	);
	assert.equal(result.success, false);
	assert.deepEqual(result.error, {
		kind: "already-reviewed",
		headCommit: HEAD_COMMIT,
		location: "https://github.com/org/repo/pull/1#review-1",
	});
	assert.equal(workdir.readAudits().length, 0);
});

function setupReadyAdapterPort() {
	const snapshot = sampleSnapshot();
	const posted: Array<{ readonly outcome: Outcome; readonly ledger: Ledger }> =
		[];
	const adapter: HostAdapter = {
		host: () => sampleHost,
		resolve: (snapshotDir) =>
			Promise.resolve({
				kind: "ready",
				headCommit: HEAD_COMMIT,
				change: sampleChange(),
				snapshot: CodeUnderReviewSnapshot.from(snapshot, snapshotDir),
			}),
		post: (outcome, ledger) => {
			posted.push({ outcome, ledger });
			return Promise.resolve("local://review-42");
		},
	};
	const port = createStubPort(() => okAdapterParse(adapter), adapter);
	return { port, posted };
}

it("MainAgentController prepares a ready snapshot, tracks pending probes, and dispatches via the adapter once slices are recorded", async () => {
	mockBookFetch();
	const { port, posted } = setupReadyAdapterPort();
	const token = nonnull(AccessToken.from("unit-token").data);

	const controller = MainAgentController.create(port);
	const workdir = freshWorkdir();
	const prepared = await controller.prepareWithToken(
		"https://github.com/org/repo/pull/42",
		workdir,
		token,
	);
	assert.equal(prepared.success, true);

	const pendingNames = [...controller.ledger(workdir).pending()];
	assert.equal(pendingNames.length > 0, true);

	const beforeDispatch = await controller.dispatch(workdir);
	assert.equal(beforeDispatch.kind, "pending");
	assert.deepEqual(beforeDispatch.remaining, pendingNames);
	assert.equal(posted.length, 0);

	const written = workdir.readAudits().map((audit) => {
		workdir.ledgerDirectory().writeSlice(audit.name, {
			headCommit: HEAD_COMMIT,
			rows: stubPassingRowsForAudit(audit.document),
		});
		return audit.name;
	});
	assert.deepEqual(written, pendingNames);

	const freshController = MainAgentController.create(port);
	const submitted = await freshController.dispatchWithToken(workdir, token);
	assert.equal(submitted.kind, "submitted");
	assert.equal(submitted.location, "local://review-42");
	assert.equal(submitted.outcome.verdict, "approve");
	assert.equal(posted.length, 1);
});
