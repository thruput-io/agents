import assert from "node:assert/strict";
import { test as it } from "node:test";
import { narrowSurface, threadRanges, wholeSurface } from "./surface.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);

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
		{
			path: "deleted.sh",
			added: [],
			removed: [{ start: 1, end: 2, content: "old1\nold2" }],
		},
		{ path: "d.sh", added: [{ start: 1, end: 9 }], removed: [] },
		{ path: "empty.txt", added: [], removed: [] },
	],
};

it("wholeSurface keeps added line ranges and excludes deletion-only or zero-hunk files", () => {
	assert.deepEqual(wholeSurface(changeSet), {
		files: [
			{ path: "a.sh", added: [{ start: 1, end: 20 }] },
			{ path: "b.sh", added: [{ start: 1, end: 1 }] },
			{ path: "d.sh", added: [{ start: 1, end: 9 }] },
		],
	});
});

it("narrowSurface keeps new lines changed since the prior review or carrying an unsettled head thread", () => {
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
				},
			],
		},
	);
});
