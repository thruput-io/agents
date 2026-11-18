import assert from "node:assert/strict";
import { test as it } from "node:test";
import { projectFiles } from "archunit";

const TRANSPORT_IMPORT_RE =
	/\b(?:from\s+["']node:(?:fs|child_process|http|https)["']|fetch\s*\()/u;

it("src has no circular dependencies", async () => {
	const violations = await projectFiles()
		.inFolder("src/**")
		.should()
		.haveNoCycles()
		.check();
	assert.deepEqual(violations, []);
});

it("domain layer is pure and does not depend on io, controller, adapters, client, or transport APIs", async () => {
	const layerViolations = await projectFiles()
		.inFolder("src/domain/**")
		.shouldNot()
		.dependOnFiles()
		.inPath(
			"{src/io/**,src/controller/**,src/adapters/**,src/client/**,clients/**}",
		)
		.check();
	assert.deepEqual(layerViolations, []);

	const transportViolations = await projectFiles()
		.inFolder("src/domain/**")
		.should()
		.adhereTo(
			(file) => !TRANSPORT_IMPORT_RE.test(file.content),
			"Domain files must not use node:fs, node:child_process, node:http(s), or fetch()",
		)
		.check();
	assert.deepEqual(transportViolations, []);
});

it("io layer only depends on domain and io", async () => {
	const violations = await projectFiles()
		.inFolder("src/io/**")
		.shouldNot()
		.dependOnFiles()
		.inPath("{src/controller/**,src/adapters/**,src/client/**,clients/**}")
		.check();
	assert.deepEqual(violations, []);
});

it("adapters layer only depends on domain, io, adapters, and generated clients", async () => {
	const violations = await projectFiles()
		.inFolder("src/adapters/**")
		.shouldNot()
		.dependOnFiles()
		.inPath("{src/controller/**,src/client/**}")
		.check();
	assert.deepEqual(violations, []);
});

it("controller layer does not depend on client, and controller tests do not depend on adapters", async () => {
	const clientViolations = await projectFiles()
		.inFolder("src/controller/**")
		.shouldNot()
		.dependOnFiles()
		.inPath("{src/client/**,clients/**}")
		.check();
	assert.deepEqual(clientViolations, []);

	const adapterTestViolations = await projectFiles()
		.inPath("src/controller/*.test.ts")
		.shouldNot()
		.dependOnFiles()
		.inFolder("src/adapters/**")
		.check();
	assert.deepEqual(adapterTestViolations, []);
});

it("client UI layer only depends on domain, io, controller, and client (never adapters)", async () => {
	const violations = await projectFiles()
		.inFolder("src/client/**")
		.shouldNot()
		.dependOnFiles()
		.inPath("{src/adapters/**,clients/**}")
		.check();
	assert.deepEqual(violations, []);
});
