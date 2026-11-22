import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import { projectFiles } from "archunit";

const TSCONFIG_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../tsconfig.json",
);

const ALLOWED_SRC_FILES =
	"{src/client/main/**,src/client/sub/**,src/client/common/**,src/controller/main/**,src/controller/sub/**,src/controller/common/**,src/adapters/github/**,src/adapters/azure/**,src/adapters/git/**,src/domain/**,src/integration-test/**,src/architecture.test.ts,src/guardrails.test.ts}";

const onlyDependsOn = (sourceGlob: string, allowedGlob: string) =>
	projectFiles(TSCONFIG_PATH)
		.inPath(sourceGlob)
		.shouldNot()
		.dependOnFiles()
		.inPath("**", { except: { inPath: allowedGlob } })
		.check();

it("every file in src/** lives in an allowed layer folder", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("src/**", { except: { inPath: ALLOWED_SRC_FILES } })
		.should()
		.adhereTo(
			() => false,
			"All files in src/ must reside in src/client/{main,sub,common}, src/controller/{main,sub,common}, src/adapters/{github,azure,git}, src/domain, or src/integration-test",
		)
		.check();
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

it("domain layer only depends on domain", async () => {
	assert.deepEqual(await onlyDependsOn("src/domain/**", "src/domain/**"), []);
});

it("each adapter subfolder only depends on itself, domain, and generated clients", async () => {
	assert.deepEqual(
		await onlyDependsOn(
			"src/adapters/github/**",
			"{src/adapters/github/**,src/domain/**,clients/**}",
		),
		[],
	);
	assert.deepEqual(
		await onlyDependsOn(
			"src/adapters/azure/**",
			"{src/adapters/azure/**,src/domain/**,clients/**}",
		),
		[],
	);
	assert.deepEqual(
		await onlyDependsOn(
			"src/adapters/git/**",
			"{src/adapters/git/**,src/domain/**,clients/**}",
		),
		[],
	);
});

it("controller layer only depends on controller, adapters, and domain", async () => {
	assert.deepEqual(
		await onlyDependsOn(
			"src/controller/**",
			"{src/controller/**,src/adapters/**,src/domain/**}",
		),
		[],
	);
});

it("client layer only depends on client, controller, and domain", async () => {
	assert.deepEqual(
		await onlyDependsOn(
			"src/client/**",
			"{src/client/**,src/controller/**,src/domain/**}",
		),
		[],
	);
});

it("!common subfolders may depend on common within the same folder, and common never depends on !common", async () => {
	for (const layer of ["src/controller", "src/client"] as const) {
		assert.deepEqual(
			await projectFiles(TSCONFIG_PATH)
				.inPath(`${layer}/common/**`)
				.shouldNot()
				.dependOnFiles()
				.inPath(`${layer}/**`, { except: { inPath: `${layer}/common/**` } })
				.check(),
			[],
		);
		for (const sub of ["main", "sub"] as const) {
			assert.deepEqual(
				await projectFiles(TSCONFIG_PATH)
					.inPath(`${layer}/${sub}/**`)
					.shouldNot()
					.dependOnFiles()
					.inPath(`${layer}/**`, {
						except: { inPath: `{${layer}/${sub}/**,${layer}/common/**}` },
					})
					.check(),
				[],
			);
		}
	}
});
