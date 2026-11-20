import assert from "node:assert/strict";
import { test as it } from "node:test";
import { nonnull } from "../domain/nullish.ts";
import type { WorkspacePort } from "../domain/ports.ts";
import { toAgentInstructions } from "../domain/probe-document.ts";
import {
	H,
	rulesAuditDocument,
	sampleChange,
	sampleRulebook,
} from "./controller-fixtures.test.ts";
import { createMemoryWorkspace } from "./memory-workspace.test.ts";
import { SubAgentController } from "./sub-agent-controller.ts";

const LARGE_LINE_COUNT = 120;
const LINE_WIDTH = 80;
const SURFACE_LINE_OFFSET = 121;
const RULE_SECTION_COUNT = 200;
const GUIDELINE_REPEATS = 8;
const MAX_PAGE_BYTES = 5000;

const samplePagingFiles = () => {
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
	const smallFile = (path: string, id: string, text: string) => ({
		path,
		fragments: [
			{
				kind: "surface" as const,
				side: "head" as const,
				lines: [{ idToReportViolationOn: id, text }],
			},
		],
	});
	return [
		bigFileOne,
		smallFile("small.ts", "small.ts:1", "export const ok = 1;"),
		smallFile("small-two.ts", "small-two.ts:1", "export const second = 2;"),
	];
};

const setupPagingWorkspace = (
	workdir: WorkspacePort,
	bigRulesetUrl: string,
) => {
	const files = samplePagingFiles();
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
	const surface = { headCommit: H, files };
	workdir.ledgerDirectory().writePullRequest({
		change: sampleChange,
		surface,
		fragments: files.flatMap((file) => file.fragments),
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
};

function collectPages(
	sub: SubAgentController,
	acc: {
		readonly overLimit: readonly boolean[];
		readonly seenPaths: readonly string[];
		readonly lastTotalPages: number;
	},
): {
	readonly overLimit: readonly boolean[];
	readonly seenPaths: readonly string[];
	readonly lastTotalPages: number;
} {
	const page = sub.next();
	const byteLength = Buffer.byteLength(JSON.stringify(page), "utf8");
	if (page.success && page.status === "page") {
		return collectPages(sub, {
			overLimit: [...acc.overLimit, byteLength > MAX_PAGE_BYTES],
			seenPaths: [...acc.seenPaths, page.path],
			lastTotalPages: page.totalPages,
		});
	}
	return {
		...acc,
		overLimit: [...acc.overLimit, byteLength > MAX_PAGE_BYTES],
	};
}

it("SubAgentController instructions, ack, rules, next, and prev stay small and targeted", () => {
	const workdir = createMemoryWorkspace("/tmp/controller-paging/workspace");
	const bigRulesetUrl =
		"https://github.com/ciembor/agent-rules-books/blob/main/ddd/ddd.md";
	setupPagingWorkspace(workdir, bigRulesetUrl);

	const purposeSub = SubAgentController.forWorkdir(workdir, "01-purpose");
	const instRes = purposeSub.instructions();
	assert.equal(
		Buffer.byteLength(JSON.stringify(instRes), "utf8") <= MAX_PAGE_BYTES,
		true,
	);
	const ackRes = purposeSub.ack().response;
	assert.equal(
		Buffer.byteLength(JSON.stringify(ackRes), "utf8") <= MAX_PAGE_BYTES,
		true,
	);
	const rulesRes = purposeSub.rulesResponse();
	assert.equal(rulesRes.success, true);
	assert.equal(
		Buffer.byteLength(JSON.stringify(rulesRes), "utf8") <= MAX_PAGE_BYTES,
		true,
	);

	const { overLimit, seenPaths, lastTotalPages } = collectPages(purposeSub, {
		overLimit: [],
		seenPaths: [],
		lastTotalPages: 0,
	});
	assert.equal(
		overLimit.every((flag) => !flag),
		true,
	);
	assert.equal(lastTotalPages > 1, true);
	assert.equal(seenPaths.filter((p) => p === "large.ts").length > 1, true);
	assert.equal(seenPaths.includes("small.ts"), true);
	assert.equal(seenPaths.at(-1), "small-two.ts");

	const steppedBack = purposeSub.prev();
	assert.equal(steppedBack.success, true);
	assert.equal((steppedBack as { readonly status: string }).status, "page");
	assert.equal((steppedBack as { readonly path: string }).path, "small-two.ts");
});

it("SubAgentController rules pages external context rulebooks under 5KB", () => {
	const workdir = createMemoryWorkspace(
		"/tmp/controller-paging/workspace-book",
	);
	const bigRulesetUrl =
		"https://github.com/ciembor/agent-rules-books/blob/main/ddd/ddd.md";
	setupPagingWorkspace(workdir, bigRulesetUrl);
	const contextSub = SubAgentController.forWorkdir(workdir, "02-context");
	contextSub.ack();
	const indexRes = contextSub.rulesResponse();
	assert.equal(indexRes.success, true);
	assert.equal("rulesets" in indexRes, true);
	const firstBook = contextSub.rulesResponse(bigRulesetUrl, 1);
	assert.equal(firstBook.success, true);
	assert.equal("text" in firstBook, true);
	if (!("text" in firstBook)) {
		return;
	}
	assert.equal(
		Buffer.byteLength(JSON.stringify(firstBook), "utf8") <= MAX_PAGE_BYTES,
		true,
	);
	assert.equal(firstBook.page, 1);
	assert.equal(firstBook.totalPages > 1, true);

	const secondBook = contextSub.rulesResponse(bigRulesetUrl, 2);
	assert.equal(secondBook.success, true);
	assert.equal("text" in secondBook, true);
	if (!("text" in secondBook)) {
		return;
	}
	assert.equal(
		Buffer.byteLength(JSON.stringify(secondBook), "utf8") <= MAX_PAGE_BYTES,
		true,
	);
	assert.equal(secondBook.page, 2);
	assert.notEqual(secondBook.text, firstBook.text);
	assert.equal(nonnull(firstBook.text).length > 0, true);
});
