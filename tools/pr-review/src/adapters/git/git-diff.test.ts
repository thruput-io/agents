import assert from "node:assert/strict";
import { test as it } from "node:test";
import { pagesOf } from "./git-diff.ts";

const diff = [
	"diff --git a/src/one.ts b/src/one.ts",
	"index 1111111..2222222 100644",
	"--- a/src/one.ts",
	"+++ b/src/one.ts",
	"@@ -1,2 +1,3 @@",
	" first",
	"-old",
	"+new",
	"+added",
	"diff --git a/gone.ts b/gone.ts",
	"deleted file mode 100644",
	"--- a/gone.ts",
	"+++ /dev/null",
	"@@ -1 +0,0 @@",
	"-removed",
	"diff --git a/two.ts b/two.ts",
	"--- a/two.ts",
	"+++ b/two.ts",
	"@@ -10,0 +11 @@ context",
	"+eleven",
	"",
].join("\n");

it("a diff gives a page per changed file, with the place of each added line", () => {
	assert.deepEqual(pagesOf(diff), [
		"\tfirst\nsrc/one.ts:2\tnew\nsrc/one.ts:3\tadded",
		"two.ts:11\televen",
	]);
});
