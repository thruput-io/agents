import { z } from "zod";
import { GithubPullRequest } from "../domain/code-under-review.ts";
import type { Change, Row } from "../domain/contracts.g.ts";
import type {
	AdapterResolution,
	HostAdapter,
	HostAdapterPort,
} from "../domain/host-adapter.ts";
import { nonnull } from "../domain/nullish.ts";

const HEAD_COMMIT = "1111111111111111111111111111111111111111";

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
	postResult: Awaited<ReturnType<HostAdapter["post"]>>,
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
	adapterForRehydrate: HostAdapter,
): HostAdapterPort => {
	const pullRequest = sampleSnapshot();
	return {
		from: resolveAdapter,
		fromWithToken: resolveAdapter,
		rehydrate: () => ({ pullRequest, adapter: adapterForRehydrate }),
		rehydrateWithToken: () => ({ pullRequest, adapter: adapterForRehydrate }),
	};
};

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

export {
	createStubPort,
	HEAD_COMMIT,
	okAdapterParse,
	sampleChange,
	sampleHost,
	sampleSnapshot,
	stubAdapter,
	stubPassingRowsForAudit,
};
