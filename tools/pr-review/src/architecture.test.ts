import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import { projectFiles } from "archunit";

const TSCONFIG_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../tsconfig.json",
);
const TRANSPORT_IMPORT_RE =
	/\b(?:from\s+["']node:(?:fs|child_process|http|https)["']|fetch\s*\()/u;

const ALLOWED_SRC_FILES =
	"{src/client/**,src/controller/**,src/adapters/**,src/domain/**,src/integration-test/**,src/architecture.test.ts,src/guardrails.test.ts}";

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
			"All files in src/ must reside in src/client, src/controller, src/adapters, src/domain, or src/integration-test",
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

it("domain layer only depends on domain and uses no transport APIs", async () => {
	assert.deepEqual(await onlyDependsOn("src/domain/**", "src/domain/**"), []);

	const transportViolations = await projectFiles(TSCONFIG_PATH)
		.inFolder("src/domain/**")
		.should()
		.adhereTo(
			(file) => !TRANSPORT_IMPORT_RE.test(file.content),
			"Domain files must not use node:fs, node:child_process, node:http(s), or fetch()",
		)
		.check();
	assert.deepEqual(transportViolations, []);
});

it("adapters layer only depends on adapters, domain, and generated clients", async () => {
	assert.deepEqual(
		await onlyDependsOn(
			"src/adapters/**",
			"{src/adapters/**,src/domain/**,clients/**}",
		),
		[],
	);
});

it("controller layer only depends on controller, adapters, and domain, and controller unit tests only depend on controller and domain", async () => {
	assert.deepEqual(
		await onlyDependsOn(
			"src/controller/**",
			"{src/controller/**,src/adapters/**,src/domain/**}",
		),
		[],
	);
	assert.deepEqual(
		await onlyDependsOn(
			"src/controller/*.test.ts",
			"{src/controller/**,src/domain/**}",
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
