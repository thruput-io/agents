import assert from "node:assert/strict";
import { test as it } from "node:test";
import { projectFiles } from "archunit";
import {
	DOMAIN,
	dependsOnlyOn,
	PERIMETERS,
	TSCONFIG_PATH,
} from "./architecture.ts";

const LAYOUT =
	"{src/client/main/**,src/client/sub/**,src/client/common/**,src/controller/main/**,src/controller/sub/**,src/controller/common/**,src/domain/**,src/perimeters/**,src/adapters/github/**,src/adapters/azure/**,src/adapters/git/**,src/adapters/persistence/memory/**,src/adapters/persistence/disk/**,src/adapters/not-yet-implemented/**,src/generated/domain/**,src/generated/client/**,src/generated/perimeters/**,src/generated/adapters/**,src/generated/mock-server/**,src/generated/integration-test/**,src/integration-test/**,src/mock-server/**,src/architecture.ts,src/architecture.test.ts,src/architecture-separation.test.ts}";

const UNKNOWN_TYPE =
	/(?:[:<,|&(=]|=>|\bas|\bextends|\bkeyof)\s*unknown\b(?!-)/u;

it("every file in src lives in a folder of the layout", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("src/**", { except: { inPath: LAYOUT } })
		.should()
		.adhereTo(
			(): boolean => false,
			"The file is outside the folders of the layout",
		)
		.check({ allowEmptyTests: true });

	assert.deepEqual(violations, []);
});

it("src has no circular dependencies", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inFolder("src/**")
		.should()
		.haveNoCycles()
		.check();

	assert.deepEqual(violations, []);
});

it("no file uses the type unknown", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("{src/**,scripts/**}")
		.should()
		.adhereTo(
			(file: { readonly content: string }): boolean =>
				!UNKNOWN_TYPE.test(file.content),
			"The type unknown is not allowed: use a contract or a domain type",
		)
		.check({ allowEmptyTests: true });

	assert.deepEqual(violations, []);
});

it("the domain depends only on the domain and its generated mirror", async () => {
	assert.deepEqual(await dependsOnlyOn("src/domain/**", `{${DOMAIN}}`), []);
});

it("the generated domain depends only on itself", async () => {
	assert.deepEqual(
		await dependsOnlyOn("src/generated/domain/**", "src/generated/domain/**"),
		[],
	);
});

it("the controller depends only on the controller and the domain", async () => {
	assert.deepEqual(
		await dependsOnlyOn("src/controller/**", `{src/controller/**,${DOMAIN}}`),
		[],
	);
});

it("the perimeters depend only on the perimeters and the domain", async () => {
	assert.deepEqual(
		await dependsOnlyOn("src/perimeters/**", `{${PERIMETERS}}`),
		[],
	);
});

it("the github adapter depends only on itself, its generated client and the perimeters", async () => {
	assert.deepEqual(
		await dependsOnlyOn(
			"src/adapters/github/**",
			`{src/adapters/github/**,src/generated/adapters/github/**,${PERIMETERS}}`,
		),
		[],
	);
});

it("the azure adapter depends only on itself, its generated client and the perimeters", async () => {
	assert.deepEqual(
		await dependsOnlyOn(
			"src/adapters/azure/**",
			`{src/adapters/azure/**,src/generated/adapters/azure/**,${PERIMETERS}}`,
		),
		[],
	);
});

it("the git adapter depends only on itself and the perimeters", async () => {
	assert.deepEqual(
		await dependsOnlyOn(
			"src/adapters/git/**",
			`{src/adapters/git/**,${PERIMETERS}}`,
		),
		[],
	);
});

it("the memory store depends only on itself and the perimeters", async () => {
	assert.deepEqual(
		await dependsOnlyOn(
			"src/adapters/persistence/memory/**",
			`{src/adapters/persistence/memory/**,${PERIMETERS}}`,
		),
		[],
	);
});

it("the disk store depends only on itself and the perimeters", async () => {
	assert.deepEqual(
		await dependsOnlyOn(
			"src/adapters/persistence/disk/**",
			`{src/adapters/persistence/disk/**,src/adapters/not-yet-implemented/**,${PERIMETERS}}`,
		),
		[],
	);
});

it("the not yet implemented adapters depend only on themselves and the domain", async () => {
	assert.deepEqual(
		await dependsOnlyOn(
			"src/adapters/not-yet-implemented/**",
			`{src/adapters/not-yet-implemented/**,${DOMAIN}}`,
		),
		[],
	);
});
