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

it("src has no circular dependencies", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inFolder("src/**")
		.should()
		.haveNoCycles()
		.check();
	assert.deepEqual(violations, []);
});

it("domain layer is pure and does not depend on controller, adapters, client, integration-test, or transport APIs", async () => {
	const layerViolations = await projectFiles(TSCONFIG_PATH)
		.inFolder("src/domain/**")
		.shouldNot()
		.dependOnFiles()
		.inPath(
			"{src/controller/**,src/adapters/**,src/client/**,src/integration-test/**,src/generated/adapters/**}",
		)
		.check();
	assert.deepEqual(layerViolations, []);

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

it("controller layer only depends on domain and controller (no client, adapters, or integration-test)", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inFolder("src/controller/**")
		.shouldNot()
		.dependOnFiles()
		.inPath(
			"{src/adapters/**,src/client/**,src/integration-test/**,src/generated/adapters/**}",
		)
		.check();
	assert.deepEqual(violations, []);
});

it("client layer only depends on domain, controller, and client (never adapters)", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inFolder("src/client/**")
		.shouldNot()
		.dependOnFiles()
		.inPath(
			"{src/adapters/**,src/integration-test/**,src/generated/adapters/**}",
		)
		.check();
	assert.deepEqual(violations, []);
});

it("adapters layer only depends on domain, adapters, and generated clients", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inFolder("src/adapters/**")
		.shouldNot()
		.dependOnFiles()
		.inPath("{src/controller/**,src/client/**,src/integration-test/**}")
		.check();
	assert.deepEqual(violations, []);
});
