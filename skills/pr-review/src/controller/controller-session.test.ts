import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { z } from "zod";
import {
	GithubPullRequest,
	rehydrateCodeUnderReview,
} from "../domain/code-under-review.ts";
import { Instructions } from "../domain/instructions.ts";
import { nonnull } from "../domain/nullish.ts";
import { Rulebook } from "../domain/rulebook.ts";
import type { HostAdapter, HostAdapterPort } from "../io/host-adapter.ts";
import { Workdir } from "../io/workdir.ts";
import { MainAgentController } from "./controller.ts";
import { SubAgentController } from "./sub-agent-controller.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const INITIAL_CLOCK_MS = 1000;
const AFTER_DEADLINE_OFFSET_MS = 300_001;

const sampleRulebook = () =>
	nonnull(
		Rulebook.slice(
			[
				{
					id: "Stated purpose",
					body: "State the [[Purpose]] of every [[Change]].",
					parent: "You aren't gonna need it",
					marker: "MUST",
					group: "Purpose",
				},
			],
			{
				principles: [
					{
						id: "You aren't gonna need it",
						body: "Always implement things when you actually need them.",
						parent: "Code is a liability, not an asset",
					},
				],
			},
		).data,
	);

const sampleFile = {
	path: "a.ts",
	fragments: [
		{
			kind: "surface" as const,
			side: "head" as const,
			lines: [
				{
					idToReportViolationOn: "a.ts:1",
					text: "const x = 1;",
				},
			],
		},
	],
};
const sampleSurface = [sampleFile];
const sampleChange = {
	host: {
		kind: "github" as const,
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	},
	author: "author",
	description: "Body",
};

const stubAdapter: HostAdapter = {
	host: () => sampleChange.host,
	resolve: () =>
		Promise.resolve({
			kind: "already-reviewed",
			headCommit: H,
			location: "stub://review",
		}),
	post: () => Promise.resolve("stub://review"),
};

const stubAdapterPort: HostAdapterPort = {
	from: (url) =>
		z
			.url()
			.transform(() => stubAdapter)
			.safeDecode(url),
	fromWithToken: (url) =>
		z
			.url()
			.transform(() => stubAdapter)
			.safeDecode(url),
	rehydrate: (persisted) => ({
		pullRequest: rehydrateCodeUnderReview(persisted),
		adapter: stubAdapter,
	}),
	rehydrateWithToken: (persisted) => ({
		pullRequest: rehydrateCodeUnderReview(persisted),
		adapter: stubAdapter,
	}),
};

const setupRehydratedWorkdir = (tempRoot: string) => {
	const workdir = nonnull(Workdir.from(join(tempRoot, "workspace")).data);
	const rb = sampleRulebook();
	workdir.ledgerDirectory().writePullRequest({
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		fragments: sampleFile.fragments,
		threads: { threads: [] },
	});
	workdir.writeAudit("01-purpose", {
		instructions: SubAgentController.forProbe(
			workdir,
			nonnull(GithubPullRequest.from(sampleChange.host).data),
			{
				kind: "rules",
				change: sampleChange,
				surface: { headCommit: H, files: sampleSurface },
				rulebook: rb,
			},
		)
			.instructions()
			.prose(),
		task: Instructions.forKind("rules").task() as Extract<
			ReturnType<SubAgentController["inspect"]>,
			{ readonly kind: "rules" }
		>["task"],
		permissions: ["Bash(review-tool-probe*)"],
		kind: "rules",
		change: sampleChange,
		surface: { headCommit: H, changedFiles: 1, totalPages: 1 },
		ruleset: rb.toRuleset(),
	});
	return workdir;
};

it("SubAgentController.forSession rehydrates a probe, rejects tampered audit, and hides workdir", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "controller-rehydrate-"));
	try {
		const workdir = setupRehydratedWorkdir(tempRoot);
		const sessionToken = workdir.sessionToken();
		assert.equal(sessionToken.includes(tempRoot), false);
		const resolvedFromSession = Workdir.fromSession(sessionToken);
		assert.equal(resolvedFromSession.success, true);
		assert.equal(resolvedFromSession.data.equals(workdir), true);

		const auditFile = join(
			workdir.toString(),
			"instructions",
			"01-purpose.json",
		);
		const originalAudit = readFileSync(auditFile, "utf8");
		writeFileSync(
			auditFile,
			JSON.stringify({
				...JSON.parse(originalAudit),
				task: "Tampered task from main agent",
			}),
			"utf8",
		);
		assert.throws(() =>
			SubAgentController.forSession(sessionToken, "01-purpose"),
		);
		writeFileSync(auditFile, originalAudit, "utf8");

		const rehydratedSub = SubAgentController.forSession(
			sessionToken,
			"01-purpose",
		);
		assert.deepEqual(rehydratedSub.change(), sampleChange);
		assert.deepEqual(rehydratedSub.codeUnderReview().surface(), sampleSurface);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

it("SubAgentController enforces ack and 5-minute deadline across rehydrated sessions", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "controller-deadline-"));
	try {
		const workdir = setupRehydratedWorkdir(tempRoot);
		const sessionToken = workdir.sessionToken();
		let currentClock = INITIAL_CLOCK_MS;
		const rehydratedSub = SubAgentController.forSession(
			sessionToken,
			"01-purpose",
			() => currentClock,
		);
		const beforeAck = rehydratedSub.report([
			{
				rule: "Stated purpose",
				examined: ["a.ts"],
				verdict: "clean",
				evidence: "stated",
			},
		]);
		assert.equal(beforeAck.success, false);
		const beforeAckMain =
			MainAgentController.create(stubAdapterPort).ledger(workdir);
		assert.deepEqual(beforeAckMain.acknowledged(), []);
		assert.deepEqual(beforeAckMain.unacknowledged(), ["01-purpose"]);

		const rehydratedAck = rehydratedSub.ack({
			message: "Inspect 01-purpose",
			rulesInOrder: ["Stated purpose"],
			observationFormat: "<observation> breaks <principle>",
		});
		assert.equal(rehydratedAck.success, true);
		const afterAckMain =
			MainAgentController.create(stubAdapterPort).ledger(workdir);
		assert.deepEqual(afterAckMain.acknowledged(), ["01-purpose"]);
		assert.deepEqual(afterAckMain.unacknowledged(), []);

		currentClock = INITIAL_CLOCK_MS + AFTER_DEADLINE_OFFSET_MS;
		const lateReportResult = rehydratedSub.report([
			{
				rule: "Stated purpose",
				examined: ["a.ts"],
				verdict: "clean",
				evidence: "stated",
			},
		]);
		assert.equal(lateReportResult.success, true);
		assert.equal(lateReportResult.data.kind, "submitted");
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});
