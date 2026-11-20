import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import { Workdir } from "./adapters/fs/workdir.ts";
import {
	H,
	rulesAuditDocument,
	sampleChange,
	sampleRulebook,
} from "./controller/controller-fixtures.test.ts";
import { nonnull } from "./domain/nullish.ts";
import { toAgentInstructions } from "./domain/probe-document.ts";

const SRC_DIR = fileURLToPath(new URL(".", import.meta.url));
const LARGE_LINE_COUNT = 120;
const LINE_WIDTH = 80;
const SURFACE_LINE_OFFSET = 121;
const RULE_SECTION_COUNT = 200;
const GUIDELINE_REPEATS = 8;
const MAX_CLI_OUTPUT_BYTES = 9000;

const setupPagingWorkdir = (tempRoot: string, bigRulesetUrl: string) => {
	const workdir = nonnull(Workdir.from(join(tempRoot, "workspace")).data);
	const bigFileOne = {
		path: "large.ts",
		fragments: [
			{
				kind: "context" as const,
				lines: Array.from(
					{ length: LARGE_LINE_COUNT },
					(_, i) => `const contextLine${i} = "${"c".repeat(LINE_WIDTH)}";`,
				),
			},
			{
				kind: "surface" as const,
				side: "head" as const,
				lines: Array.from({ length: LARGE_LINE_COUNT }, (_, i) => ({
					idToReportViolationOn: `large.ts:${i + SURFACE_LINE_OFFSET}`,
					text: `export const line${i} = "${"x".repeat(LINE_WIDTH)}";`,
				})),
			},
		],
	};
	const smallFileTwo = {
		path: "small.ts",
		fragments: [
			{
				kind: "surface" as const,
				side: "head" as const,
				lines: [
					{ idToReportViolationOn: "small.ts:1", text: "export const ok = 1;" },
				],
			},
		],
	};
	const bigRuleset = {
		url: bigRulesetUrl,
		title: "Domain-Driven Design",
		focus: "Domain Modeling",
		whenToUse: "When changing domain code.",
		text: Array.from(
			{ length: RULE_SECTION_COUNT },
			(_, i) =>
				`## Rule ${i + 1}\n${"Guideline text ".repeat(GUIDELINE_REPEATS)}`,
		).join("\n"),
	};
	const surface = { headCommit: H, files: [bigFileOne, smallFileTwo] };
	workdir.ledgerDirectory().writePullRequest({
		change: sampleChange,
		surface,
		fragments: [...bigFileOne.fragments, ...smallFileTwo.fragments],
		threads: { threads: [] },
	});
	workdir.ledgerDirectory().writeRulesets([bigRuleset]);
	workdir.writeAudit("01-purpose", rulesAuditDocument(sampleRulebook()));
	workdir.writeAudit(
		"02-context",
		toAgentInstructions({
			kind: "context",
			change: sampleChange,
			surface,
			rulesets: [bigRuleset],
			checkout: workdir.snapshotDirectory().toString(),
		}),
	);
	return workdir.sessionToken();
};

const runSubCliJson = <T>(args: readonly string[]) => {
	const cliPath = join(SRC_DIR, "review-tool-probe.ts");
	const res = spawnSync(process.execPath, [cliPath, ...args], {
		encoding: "utf8",
	});
	let payload: T | null = null;
	if (res.status === 0) {
		payload = JSON.parse(res.stdout) as T;
	}
	return {
		status: res.status,
		output: res.stderr || res.stdout,
		byteLength: Buffer.byteLength(res.stdout, "utf8"),
		payload,
	};
};

function collectPages(
	session: string,
	acc: {
		readonly statuses: readonly (number | null)[];
		readonly overLimit: readonly boolean[];
		readonly seenPaths: readonly string[];
		readonly lastTotalPages: number;
	},
): {
	readonly statuses: readonly (number | null)[];
	readonly overLimit: readonly boolean[];
	readonly seenPaths: readonly string[];
	readonly lastTotalPages: number;
} {
	const run = runSubCliJson<{
		readonly status: "page" | "end";
		readonly path?: string;
		readonly totalPages: number;
	}>(["next", session, "01-purpose"]);
	const current = nonnull(run.payload);
	const nextAcc = {
		statuses: [...acc.statuses, run.status],
		overLimit: [...acc.overLimit, run.byteLength > MAX_CLI_OUTPUT_BYTES],
		seenPaths: acc.seenPaths,
		lastTotalPages: acc.lastTotalPages,
	};
	const nextStep: Record<"page" | "end", () => typeof acc> = {
		end: () => nextAcc,
		page: () =>
			collectPages(session, {
				...nextAcc,
				seenPaths: [...nextAcc.seenPaths, nonnull(current.path)],
				lastTotalPages: current.totalPages,
			}),
	};
	return nextStep[current.status]();
}

it("review-tool-probe next, prev, and ruleset page large changed files and large rulebooks strictly under 9KB", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "controller-paging-"));
	const bigRulesetUrl =
		"https://github.com/ciembor/agent-rules-books/blob/main/ddd/ddd.md";
	try {
		const session = setupPagingWorkdir(tempRoot, bigRulesetUrl);
		const { statuses, overLimit, seenPaths, lastTotalPages } = collectPages(
			session,
			{ statuses: [], overLimit: [], seenPaths: [], lastTotalPages: 0 },
		);
		assert.equal(
			statuses.every((s) => s === 0),
			true,
		);
		assert.equal(
			overLimit.every((flag) => !flag),
			true,
		);
		assert.equal(lastTotalPages > 2, true);
		assert.equal(seenPaths.filter((p) => p === "large.ts").length > 1, true);
		assert.equal(seenPaths.at(-1), "small.ts");

		const steppedBack = runSubCliJson<{
			readonly status: string;
			readonly path: string;
		}>(["prev", session, "01-purpose"]);
		assert.equal(steppedBack.status, 0, steppedBack.output);
		assert.equal(nonnull(steppedBack.payload).status, "page");
		assert.equal(nonnull(steppedBack.payload).path, "small.ts");

		const firstBook = runSubCliJson<{
			readonly page: number;
			readonly totalPages: number;
			readonly text: string;
		}>(["ruleset", session, "02-context", bigRulesetUrl]);
		assert.equal(firstBook.byteLength <= MAX_CLI_OUTPUT_BYTES, true);
		assert.equal(nonnull(firstBook.payload).page, 1);
		assert.equal(nonnull(firstBook.payload).totalPages > 1, true);
		const secondBook = runSubCliJson<{
			readonly page: number;
			readonly text: string;
		}>(["ruleset", session, "02-context", bigRulesetUrl, "2"]);
		assert.equal(secondBook.byteLength <= MAX_CLI_OUTPUT_BYTES, true);
		assert.equal(nonnull(secondBook.payload).page, 2);
		assert.notEqual(
			nonnull(secondBook.payload).text,
			nonnull(firstBook.payload).text,
		);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});
