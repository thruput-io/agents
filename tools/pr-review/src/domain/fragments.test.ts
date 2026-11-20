import assert from "node:assert/strict";
import { test as it } from "node:test";
import { fragments, numbered } from "./fragments.ts";

const TWELVE_LINES = 12;

it("numbered lists the lines of a file by their number from 1, a final newline ending the last line rather than starting another, and an empty file having none", () => {
	assert.deepEqual(numbered("#!/usr/bin/env bash\nset -euo pipefail\n"), {
		1: "#!/usr/bin/env bash",
		2: "set -euo pipefail",
	});
	assert.deepEqual(numbered("a\n\nb"), { 1: "a", 2: "", 3: "b" });
	assert.deepEqual(numbered("a\n\n"), { 1: "a", 2: "" });
	assert.deepEqual(numbered(""), {});
	assert.deepEqual(
		Object.keys(numbered("x\n".repeat(TWELVE_LINES))).at(-1),
		String(TWELVE_LINES),
	);
});

it("fragments cuts a file into context and head surface fragments in file order with '<path>:<line>' ids", () => {
	const numberedLines = numbered("a\nb\nc\nd\n");
	assert.deepEqual(
		fragments({ path: "a.ts", lines: numberedLines }, [{ start: 2, end: 3 }]),
		[
			{ kind: "context", lines: ["a"] },
			{
				kind: "surface",
				side: "head",
				lines: [
					{ idToReportViolationOn: "a.ts:2", text: "b" },
					{ idToReportViolationOn: "a.ts:3", text: "c" },
				],
			},
			{ kind: "context", lines: ["d"] },
		],
	);
	assert.deepEqual(
		fragments({ path: "a.ts", lines: numbered("a\n") }, [{ start: 1, end: 1 }]),
		[
			{
				kind: "surface",
				side: "head",
				lines: [{ idToReportViolationOn: "a.ts:1", text: "a" }],
			},
		],
	);
});
