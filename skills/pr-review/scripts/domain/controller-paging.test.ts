import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import type { SubAgentController } from "../controller/sub-agent-controller.ts";
import { Instructions } from "./instructions.ts";
import { nonnull } from "./nullish.ts";
import { Rulebook } from "./rulebook.ts";
import { Workdir } from "./workdir.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const CLIENT_DIR = fileURLToPath(new URL("../client", import.meta.url));
const LARGE_LINE_COUNT = 120;
const LINE_WIDTH = 80;
const SURFACE_LINE_OFFSET = 121;
const RULE_SECTION_COUNT = 200;
const GUIDELINE_REPEATS = 8;
const EXPECTED_TOTAL_PAGES = 4;
const MAX_CLI_OUTPUT_BYTES = 9000;

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

const writePagingFixtures = (workdir: Workdir, bigRulesetUrl: string) => {
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
					{
						idToReportViolationOn: "small.ts:1",
						text: "export const ok = 1;",
					},
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
	workdir.ledgerDirectory().writePullRequest({
		change: sampleChange,
		surface: { headCommit: H, files: [bigFileOne, smallFileTwo] },
		fragments: [...bigFileOne.fragments, ...smallFileTwo.fragments],
		threads: { threads: [] },
	});
	workdir.ledgerDirectory().writeRulesets([bigRuleset]);
	return bigRuleset;
};

const writePagingAudits = (
	workdir: Workdir,
	bigRuleset: ReturnType<typeof writePagingFixtures>,
) => {
	const rb = sampleRulebook();
	const rulesDoc = Instructions.forKind("rules");
	workdir.writeAudit("01-purpose", {
		instructions: rulesDoc.prose(),
		task: rulesDoc.task() as Extract<
			ReturnType<SubAgentController["inspect"]>,
			{ readonly kind: "rules" }
		>["task"],
		permissions: rulesDoc.permissions() as Extract<
			ReturnType<SubAgentController["inspect"]>,
			{ readonly kind: "rules" }
		>["permissions"],
		kind: "rules",
		change: sampleChange,
		surface: {
			headCommit: H,
			changedFiles: 2,
			totalPages: EXPECTED_TOTAL_PAGES,
		},
		ruleset: rb.toRuleset(),
	});
	const contextDoc = Instructions.forKind("context");
	workdir.writeAudit("02-context", {
		instructions: contextDoc.prose(),
		task: contextDoc.task() as Extract<
			ReturnType<SubAgentController["inspect"]>,
			{ readonly kind: "context" }
		>["task"],
		permissions: contextDoc.permissions() as Extract<
			ReturnType<SubAgentController["inspect"]>,
			{ readonly kind: "context" }
		>["permissions"],
		kind: "context",
		change: sampleChange,
		surface: {
			headCommit: H,
			changedFiles: 2,
			totalPages: EXPECTED_TOTAL_PAGES,
		},
		rulesets: [
			{
				url: bigRuleset.url,
				title: bigRuleset.title,
				focus: bigRuleset.focus,
				whenToUse: bigRuleset.whenToUse,
				totalPages: EXPECTED_TOTAL_PAGES,
			},
		],
		checkout: workdir.snapshotDirectory().toString(),
	});
};

const setupPagingWorkdir = (tempRoot: string, bigRulesetUrl: string) => {
	const workdir = nonnull(Workdir.from(join(tempRoot, "workspace")).data);
	const bigRuleset = writePagingFixtures(workdir, bigRulesetUrl);
	writePagingAudits(workdir, bigRuleset);
	return workdir.sessionToken();
};

const runSubCliJson = <T>(args: readonly string[]) => {
	const cliPath = join(CLIENT_DIR, "sub-agent-cli.ts");
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

it("sub-agent-controller next, prev, and ruleset page large changed files and large rulebooks strictly under 9KB", () => {
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
