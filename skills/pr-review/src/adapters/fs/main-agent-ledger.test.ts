import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { GithubPullRequest } from "../../domain/code-under-review.ts";
import { ContextSubAgentLedger } from "../../domain/context-sub-agent-ledger.ts";
import type { Row } from "../../domain/contracts.g.ts";
import { coordinateLedgers } from "../../domain/coordinate-ledgers.ts";
import { DeadCodeSubAgentLedger } from "../../domain/dead-code-sub-agent-ledger.ts";
import type { ContextProbe, RulesProbe } from "../../domain/ledger.ts";
import { nonnull } from "../../domain/nullish.ts";
import { ReuseSubAgentLedger } from "../../domain/reuse-sub-agent-ledger.ts";
import { RulesSubAgentLedger } from "../../domain/rules-sub-agent-ledger.ts";
import { LedgerDirectory } from "./ledger-directory.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const PR = nonnull(
	GithubPullRequest.from({
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	}).data,
);
const surface = {
	headCommit: H,
	files: [
		{
			path: "p",
			fragments: [
				{
					kind: "surface" as const,
					side: "head" as const,
					lines: [{ idToReportViolationOn: "p:2", text: "L2" }],
				},
			],
		},
	],
};
const probe: RulesProbe = {
	surface,
	rulebook: { rules: [{ id: "A" }, { id: "B" }] },
};
const contextProbe: ContextProbe = {
	surface,
	rulesets: [{ url: "https://books.example/ddd.md" }],
};
const rulesSpec = (
	name: string,
	kind: "rules" | "dead-code",
	id: string,
	parent: string,
) => ({
	name,
	kind,
	probe: { surface, rulebook: { rules: [{ id, parent }] } },
});
const CLEAN = { examined: ["x"], verdict: "clean" as const, evidence: "e" };
const cleanRow = (rule: string): Row => ({ rule, ...CLEAN });
const cleanBookRow = (heading: string): Row => ({
	bookRule: { ruleset: "https://books.example/ddd.md", heading },
	...CLEAN,
});

it("coordinateLedgers records each probe slice to disk, tracks MainAgentLedger status, and auto-submits the merged outcome when the last probe reports", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "ledger-test-"));
	const dir = nonnull(LedgerDirectory.from(tempRoot).data);
	const { ledgers, mainLedger } = coordinateLedgers(dir, PR, [
		rulesSpec("01-rules", "rules", "A", "You aren't gonna need it"),
		rulesSpec("02-dead-code", "dead-code", "B", "Fail fast"),
	]);

	assert.equal(mainLedger.directory().equals(dir), true);
	assert.deepEqual(mainLedger.pullRequest().host(), PR.host());
	assert.deepEqual(mainLedger.pending(), ["01-rules", "02-dead-code"]);
	assert.deepEqual(mainLedger.completed(), []);
	assert.equal(mainLedger.submittedOutcome(), null);
	assert.equal(mainLedger.submittedLedger(), null);

	const firstReport = nonnull(ledgers[0]).report([cleanRow("A")]);
	assert.equal(firstReport.success, true);
	assert.equal(firstReport.data.kind, "recorded");
	assert.equal(existsSync(join(tempRoot, "01-rules.json")), true);
	assert.deepEqual(mainLedger.pending(), ["02-dead-code"]);
	assert.deepEqual(mainLedger.completed(), ["01-rules"]);

	const secondReport = nonnull(ledgers[1]).report([
		{
			rule: "B",
			examined: ["x"],
			verdict: "violation",
			evidence: "e",
			violations: [
				{ rule: "B", idToReportViolationOn: "p:2", observation: "bad" },
			],
		},
	]);
	assert.equal(secondReport.success, true);
	assert.equal(secondReport.data.kind, "submitted");
	assert.equal(secondReport.data.ledger.rows.length, 2);
	assert.equal(existsSync(join(tempRoot, "02-dead-code.json")), true);
	assert.deepEqual(mainLedger.pending(), []);
	assert.deepEqual(mainLedger.completed(), ["01-rules", "02-dead-code"]);
	assert.equal(mainLedger.submittedOutcome()?.verdict, "request-changes");
	assert.equal(mainLedger.submittedLedger()?.rows.length, 2);

	rmSync(tempRoot, { recursive: true, force: true });
});

it("RulesSubAgentLedger, DeadCodeSubAgentLedger, ReuseSubAgentLedger, and ContextSubAgentLedger parse rows against their probes", () => {
	const dir = nonnull(LedgerDirectory.from("/tmp/ledger").data);
	const cleanRows = [cleanRow("A"), cleanRow("B")];
	const rulesSub = RulesSubAgentLedger.from(dir, PR, probe);
	assert.equal(rulesSub.path().toString(), "/tmp/ledger");
	const rulesResult = rulesSub.report(cleanRows);
	assert.equal(rulesResult.success, true);
	assert.equal(rulesResult.data.kind, "recorded");
	assert.equal(rulesResult.data.ledger.headCommit, H);
	assert.equal(rulesSub.report([cleanRow("A")]).success, false);

	const deadCodeSub = DeadCodeSubAgentLedger.from(dir, PR, probe);
	assert.equal(deadCodeSub.path().equals(dir), true);
	assert.deepEqual(deadCodeSub.pullRequest().host(), PR.host());
	assert.equal(deadCodeSub.report(cleanRows).success, true);

	const reuseSub = ReuseSubAgentLedger.from(dir, PR, probe);
	assert.equal(reuseSub.path().equals(dir), true);
	assert.deepEqual(reuseSub.pullRequest().host(), PR.host());
	assert.equal(reuseSub.report(cleanRows).success, true);

	const contextSub = ContextSubAgentLedger.from(dir, PR, contextProbe);
	assert.equal(contextSub.path().equals(dir), true);
	assert.deepEqual(contextSub.pullRequest().host(), PR.host());
	assert.equal(
		contextSub.report([cleanBookRow("x"), cleanBookRow("y"), cleanBookRow("z")])
			.success,
		true,
	);
});
