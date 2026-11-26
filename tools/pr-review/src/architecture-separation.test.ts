import assert from "node:assert/strict";
import { test as it } from "node:test";
import { projectFiles } from "archunit";
import {
	dependsOnlyOn,
	neverDependsOn,
	othersNeverDependOn,
	TSCONFIG_PATH,
} from "./architecture.ts";

const MOCK_HOST = "{src/mock-server/**,src/generated/mock-server/**}";
const INTEGRATION_TESTS =
	"{src/integration-test/**,src/generated/integration-test/**}";

const ENTRY_POINTS =
	"{src/client/main/review-tool.ts,src/client/sub/review-tool-probe.ts}";

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
	assert.deepEqual(await othersNeverDependOn(ENTRY_POINTS), []);
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

it("the mock host depends only on itself and its generated mirror", async () => {
	assert.deepEqual(await dependsOnlyOn("src/mock-server/**", MOCK_HOST), []);
});

it("no other folder depends on the mock host or its generated mirror", async () => {
	assert.deepEqual(await othersNeverDependOn(MOCK_HOST), []);
});

it("the integration tests depend only on themselves and their generated mirror", async () => {
	assert.deepEqual(
		await dependsOnlyOn("src/integration-test/**", INTEGRATION_TESTS),
		[],
	);
});

it("no other folder depends on the integration tests or their generated mirror", async () => {
	assert.deepEqual(await othersNeverDependOn(INTEGRATION_TESTS), []);
});
