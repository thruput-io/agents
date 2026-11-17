import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	DIFF_LIMIT_EXCEEDED,
	FILE_LIMIT_EXCEEDED,
	MAX_ADDED_LINES,
	MAX_CHANGED_FILES,
	MAX_DIFF_LINES,
	MAX_FILE_LINES,
	oversizedFiles,
	tooLarge,
} from "./limits.ts";

it("tooLarge enforces hard file, added, deleted, and file-count limits without exempting tests, lockfiles, or docs", () => {
	assert.equal(MAX_FILE_LINES, 1000);
	assert.equal(MAX_ADDED_LINES, 1600);
	assert.equal(MAX_CHANGED_FILES, 250);
	assert.equal(MAX_DIFF_LINES, 8000);

	const perFileCase = [
		{ path: "a.cs", lines: 1001, added: 50 },
		{ path: "b.cs", lines: 1000, added: 50 },
		{ path: "tests/big.test.ts", lines: 1005, added: 10 },
		{ path: "package-lock.json", lines: 1200, added: 10 },
		{ path: "docs/huge.md", lines: 1002, added: 10 },
	];
	assert.deepEqual(tooLarge(perFileCase), [
		`a.cs is 1001 lines long (${FILE_LIMIT_EXCEEDED})`,
		`tests/big.test.ts is 1005 lines long (${FILE_LIMIT_EXCEEDED})`,
		`package-lock.json is 1200 lines long (${FILE_LIMIT_EXCEEDED})`,
		`docs/huge.md is 1002 lines long (${FILE_LIMIT_EXCEEDED})`,
	]);
	assert.deepEqual(oversizedFiles(perFileCase), [
		"a.cs",
		"tests/big.test.ts",
		"package-lock.json",
		"docs/huge.md",
	]);

	const addedLimitCase = [
		{ path: "a.cs", lines: 600, added: 600 },
		{ path: "package-lock.json", lines: 600, added: 600 },
		{ path: "docs/notes.md", lines: 500, added: 401 },
	];
	assert.deepEqual(tooLarge(addedLimitCase), [DIFF_LIMIT_EXCEEDED]);
	assert.deepEqual(oversizedFiles(addedLimitCase), [
		"a.cs",
		"package-lock.json",
		"docs/notes.md",
	]);

	const deletionsLimitCase = [
		{ path: "package-lock.json", lines: 0, added: 0, deleted: 8001 },
	];
	assert.deepEqual(tooLarge(deletionsLimitCase), [DIFF_LIMIT_EXCEEDED]);
	assert.deepEqual(oversizedFiles(deletionsLimitCase), ["package-lock.json"]);

	const manyFilesCase = Array.from({ length: 251 }, (_, i) => ({
		path: `docs/file-${i}.md`,
		lines: 1,
		added: 1,
	}));
	assert.deepEqual(tooLarge(manyFilesCase), [DIFF_LIMIT_EXCEEDED]);
	assert.equal(oversizedFiles(manyFilesCase).length, 251);

	assert.deepEqual(tooLarge([]), []);
	assert.deepEqual(oversizedFiles([]), []);
});
