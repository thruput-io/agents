import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test as it } from "node:test";

const GENERATED = join(import.meta.dirname, "generated");
const CLIENT_IMPORT_RE = /from\s+['"](\.\.\/client\/[^'"]+)['"]/u;

const mockFilesOf = (variant: string): string[] =>
	readdirSync(join(GENERATED, variant, "mocks"));

const clientImportOf = (variant: string): string[] =>
	mockFilesOf(variant).map((file) => {
		const source = readFileSync(join(GENERATED, variant, "mocks", file), "utf8");
		return String(CLIENT_IMPORT_RE.exec(source)?.[1]);
	});

it("orval writes one mock file into the folder of its own", () => {
	assert.deepEqual(mockFilesOf("found"), mockFilesOf("named"));
	assert.equal(mockFilesOf("found").length, 1);
});

it("a mock file imports the client with its file extension when orval finds the tsconfig", () => {
	assert.deepEqual(clientImportOf("found"), ["../client/widgets.g.ts"]);
});

it("a mock file imports the client with its file extension when the tsconfig is named", () => {
	assert.deepEqual(clientImportOf("named"), ["../client/widgets.g.ts"]);
});

it("a mock file in a folder of its own loads as a native module", async () => {
	const [file] = mockFilesOf("named");
	const mocks = await import(join(GENERATED, "named", "mocks", String(file)));
	assert.deepEqual(mocks.getGetWidgetResponseMock(), { name: "anvil" });
});
