import assert from "node:assert/strict";
import { test as it } from "node:test";
import { changedFiles, intersect, parseHunks, union } from "./diff.ts";
import { fragments, numbered, removedLines, span } from "./fragments.ts";
import { narrowSurface, threadRanges, wholeSurface } from "./surface.ts";

const H = "a".repeat(40);
const NO_REMOVED_HUNK_RE = /no removed hunk holds lines 20-20/u;

const diff = [
	"diff --git a/scripts/verify.sh b/scripts/verify.sh",
	"index 1111111..2222222 100644",
	"--- a/scripts/verify.sh",
	"+++ b/scripts/verify.sh",
	"@@ -18,3 +18,4 @@ jsonschema=(npx)",
	" lint",
	"-old",
	"+new",
	"+added",
	" tail",
	"diff --git a/web/_includes/chain.html b/web/_includes/chain.html",
	"new file mode 100644",
	"--- /dev/null",
	"+++ b/web/_includes/chain.html",
	"@@ -0,0 +1,2 @@",
	"+<ul>",
	"+</ul>",
	"diff --git a/gone.txt b/gone.txt",
	"deleted file mode 100644",
	"--- a/gone.txt",
	"+++ /dev/null",
	"@@ -1,2 +0,0 @@",
	"-a",
	"-b",
	"--- not a header",
	"",
].join("\n");

it("parseDiff numbers added lines at head and removed lines at base with their text, per file", () => {
	assert.deepEqual(changedFiles(diff), [
		{
			path: "scripts/verify.sh",
			added: [{ start: 19, end: 20 }],
			removed: [{ start: 19, end: 19, content: "old" }],
		},
		{
			path: "web/_includes/chain.html",
			added: [{ start: 1, end: 2 }],
			removed: [],
		},
		{
			path: "gone.txt",
			added: [],
			removed: [{ start: 1, end: 3, content: "a\nb\n-- not a header" }],
		},
	]);
});

it("parseHunks reads a compare-API patch without file headers", () => {
	assert.deepEqual(
		parseHunks(["@@ -5,2 +5,3 @@", " keep", "+one", "+two", " keep"]),
		{
			added: [{ start: 6, end: 7 }],
			removed: [],
		},
	);
});

it("intersect and union of ranges", () => {
	assert.deepEqual(
		intersect(
			[
				{ start: 1, end: 10 },
				{ start: 20, end: 30 },
			],
			[{ start: 5, end: 25 }],
		),
		[
			{ start: 5, end: 10 },
			{ start: 20, end: 25 },
		],
	);
	assert.deepEqual(
		union(
			[{ start: 1, end: 3 }],
			[
				{ start: 4, end: 6 },
				{ start: 10, end: 12 },
			],
		),
		[
			{ start: 1, end: 6 },
			{ start: 10, end: 12 },
		],
	);
});

const threads = [
	{
		id: "t1",
		path: "a.sh",
		side: "head" as const,
		lines: { start: 5, end: 5 },
		state: "open" as const,
		body: "x",
	},
	{
		id: "t2",
		path: "a.sh",
		side: "head" as const,
		lines: { start: 8, end: 9 },
		state: "resolved-by-author" as const,
		body: "x",
	},
	{
		id: "t3",
		path: "a.sh",
		side: "head" as const,
		lines: { start: 12, end: 12 },
		state: "resolved" as const,
		body: "x",
	},
	{
		id: "t4",
		path: "b.sh",
		side: "base" as const,
		lines: { start: 2, end: 2 },
		state: "open" as const,
		body: "x",
	},
];

it("threadRanges keeps open threads and threads the author resolved, by side", () => {
	const sides = threadRanges(threads);
	assert.deepEqual(
		[...sides.head],
		[
			[
				"a.sh",
				[
					{ start: 5, end: 5 },
					{ start: 8, end: 9 },
				],
			],
		],
	);
	assert.deepEqual([...sides.base], [["b.sh", [{ start: 2, end: 2 }]]]);
});

const changeSet = {
	headCommit: H,
	files: [
		{ path: "a.sh", added: [{ start: 1, end: 20 }], removed: [] },
		{
			path: "b.sh",
			added: [{ start: 1, end: 1 }],
			removed: [{ start: 1, end: 4, content: "one\ntwo\nthree\nfour" }],
		},
		{ path: "d.sh", added: [{ start: 1, end: 9 }], removed: [] },
		{ path: "empty.txt", added: [], removed: [] },
	],
};

it("wholeSurface is every line of the change set, by number only, excluding zero-hunk files", () => {
	assert.deepEqual(wholeSurface(changeSet), {
		files: [
			{ path: "a.sh", added: [{ start: 1, end: 20 }], removed: [] },
			{
				path: "b.sh",
				added: [{ start: 1, end: 1 }],
				removed: [{ start: 1, end: 4 }],
			},
			{ path: "d.sh", added: [{ start: 1, end: 9 }], removed: [] },
		],
	});
});

it("narrowSurface keeps change-set lines that changed since the prior review or carry a thread", () => {
	const changedSince = new Map([["a.sh", [{ start: 15, end: 30 }]]]);
	assert.deepEqual(
		narrowSurface(changeSet, changedSince, threadRanges(threads)),
		{
			files: [
				{
					path: "a.sh",
					added: [
						{ start: 5, end: 5 },
						{ start: 8, end: 9 },
						{ start: 15, end: 20 },
					],
					removed: [],
				},
				{ path: "b.sh", added: [], removed: [{ start: 2, end: 2 }] },
			],
		},
	);
});

it("numbered lists the lines of a file by their number from 1, a final newline ending the last line rather than starting another, and an empty file having none", () => {
	assert.deepEqual(numbered("#!/usr/bin/env bash\nset -euo pipefail\n"), {
		1: "#!/usr/bin/env bash",
		2: "set -euo pipefail",
	});
	assert.deepEqual(numbered("a\n\nb"), { 1: "a", 2: "", 3: "b" });
	assert.deepEqual(numbered("a\n\n"), { 1: "a", 2: "" });
	assert.deepEqual(numbered(""), {});
	assert.deepEqual(Object.keys(numbered("x\n".repeat(12))).at(-1), "12");
});

it("fragments cuts a file into context and surface fragments in order, head first, then the removed hunks as base fragments", () => {
	const numberedLines = numbered("a\nb\nc\nd\n");
	assert.deepEqual(
		fragments(
			numberedLines,
			[{ start: 2, end: 3 }],
			[{ start: 7, end: 8, content: "x\ny" }],
		),
		[
			{ kind: "context", lines: ["a"] },
			{
				kind: "surface",
				side: "head",
				lines: [
					{ idToReportViolationOn: 2, text: "b" },
					{ idToReportViolationOn: 3, text: "c" },
				],
			},
			{ kind: "context", lines: ["d"] },
			{
				kind: "surface",
				side: "base",
				lines: [
					{ idToReportViolationOn: 7, text: "x" },
					{ idToReportViolationOn: 8, text: "y" },
				],
			},
		],
	);
	assert.deepEqual(fragments({}, [], [{ start: 1, end: 1, content: "gone" }]), [
		{
			kind: "surface",
			side: "base",
			lines: [{ idToReportViolationOn: 1, text: "gone" }],
		},
	]);
	assert.deepEqual(fragments(numbered("a\n"), [{ start: 1, end: 1 }], []), [
		{
			kind: "surface",
			side: "head",
			lines: [{ idToReportViolationOn: 1, text: "a" }],
		},
	]);
});

it("span is the first and last line an anchor or a fragment covers", () => {
	assert.deepEqual(
		span([
			{ idToReportViolationOn: 3, text: "c" },
			{ idToReportViolationOn: 4, text: "d" },
			{ idToReportViolationOn: 10, text: "j" },
		]),
		{ start: 3, end: 10 },
	);
});

it("removedLines cuts the removed lines the surface keeps out of the hunks that carry their text", () => {
	const hunks = [
		{ start: 10, end: 13, content: "a\nb\nc\nd" },
		{ start: 30, end: 30, content: "z" },
	];
	assert.deepEqual(
		removedLines(hunks, [
			{ start: 11, end: 12 },
			{ start: 30, end: 30 },
		]),
		[
			{ start: 11, end: 12, content: "b\nc" },
			{ start: 30, end: 30, content: "z" },
		],
	);
	assert.deepEqual(removedLines(hunks, []), []);
	assert.throws(
		() => removedLines(hunks, [{ start: 20, end: 20 }]),
		NO_REMOVED_HUNK_RE,
	);
});
