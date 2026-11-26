import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import { projectFiles } from "archunit";

const TSCONFIG_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../tsconfig.json",
);

const LAYOUT =
	"{src/client/main/**,src/client/sub/**,src/client/common/**,src/controller/main/**,src/controller/sub/**,src/controller/common/**,src/domain/**,src/perimeters/**,src/adapters/github/**,src/adapters/azure/**,src/adapters/git/**,src/adapters/persistence/memory/**,src/adapters/persistence/disk/**,src/generated/domain/**,src/generated/perimeters/**,src/generated/adapters/**,src/integration-test/**,src/mock-server/**,src/architecture.test.ts}";

const ENTRY_POINTS =
	"{src/client/main/review-tool.ts,src/client/sub/review-tool-probe.ts}";

const DOMAIN = "src/domain/**,src/generated/domain/**";
const PERIMETERS = `src/perimeters/**,src/generated/perimeters/**,${DOMAIN}`;

const UNKNOWN_TYPE =
	/(?:[:<,|&(=]|=>|\bas|\bextends|\bkeyof)\s*unknown\b(?!-)/u;

const dependsOnlyOn = (sourceGlob: string, allowedGlob: string) =>
	projectFiles(TSCONFIG_PATH)
		.inPath(sourceGlob)
		.shouldNot()
		.dependOnFiles()
		.inPath("**", { except: { inPath: allowedGlob } })
		.check({ allowEmptyTests: true });

const neverDependsOn = (sourceGlob: string, forbiddenGlob: string) =>
	projectFiles(TSCONFIG_PATH)
		.inPath(sourceGlob)
		.shouldNot()
		.dependOnFiles()
		.inPath(forbiddenGlob)
		.check({ allowEmptyTests: true });

it("every file in src lives in a folder of the layout", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("src/**", { except: { inPath: LAYOUT } })
		.should()
		.adhereTo(() => false, "The file is outside the folders of the layout")
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
			`{src/adapters/persistence/disk/**,${PERIMETERS}}`,
		),
		[],
	);
});

it("only the entry points depend on adapters", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("src/client/**", { except: { inPath: ENTRY_POINTS } })
		.shouldNot()
		.dependOnFiles()
		.inPath("src/adapters/**")
		.check({ allowEmptyTests: true });

	assert.deepEqual(violations, []);
});

it("nothing depends on an entry point", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("src/**", { except: { inPath: ENTRY_POINTS } })
		.shouldNot()
		.dependOnFiles()
		.inPath(ENTRY_POINTS)
		.check({ allowEmptyTests: true });

	assert.deepEqual(violations, []);
});

it("the main controller never depends on the sub controller", async () => {
	assert.deepEqual(
		await neverDependsOn("src/controller/main/**", "src/controller/sub/**"),
		[],
	);
});

it("the sub controller never depends on the main controller", async () => {
	assert.deepEqual(
		await neverDependsOn("src/controller/sub/**", "src/controller/main/**"),
		[],
	);
});

it("the main client never depends on the sub client or the sub controller", async () => {
	assert.deepEqual(
		await neverDependsOn(
			"src/client/main/**",
			"{src/client/sub/**,src/controller/sub/**}",
		),
		[],
	);
});

it("the sub client never depends on the main client or the main controller", async () => {
	assert.deepEqual(
		await neverDependsOn(
			"src/client/sub/**",
			"{src/client/main/**,src/controller/main/**}",
		),
		[],
	);
});

it("the mock host depends on no other folder", async () => {
	assert.deepEqual(
		await dependsOnlyOn("src/mock-server/**", "src/mock-server/**"),
		[],
	);
});

it("no other folder depends on the mock host", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("src/**", { except: { inPath: "src/mock-server/**" } })
		.shouldNot()
		.dependOnFiles()
		.inPath("src/mock-server/**")
		.check({ allowEmptyTests: true });

	assert.deepEqual(violations, []);
});

it("the integration tests depend on no other folder", async () => {
	assert.deepEqual(
		await dependsOnlyOn("src/integration-test/**", "src/integration-test/**"),
		[],
	);
});

it("no other folder depends on the integration tests", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("src/**", { except: { inPath: "src/integration-test/**" } })
		.shouldNot()
		.dependOnFiles()
		.inPath("src/integration-test/**")
		.check({ allowEmptyTests: true });

	assert.deepEqual(violations, []);
});

it("no file uses the type unknown", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("{src/**,scripts/**}")
		.should()
		.adhereTo(
			(file) => !UNKNOWN_TYPE.test(file.content),
			"The type unknown is not allowed: use a contract or a domain type",
		)
		.check({ allowEmptyTests: true });

	assert.deepEqual(violations, []);
});
