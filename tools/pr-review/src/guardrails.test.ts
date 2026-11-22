import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import { projectFiles } from "archunit";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const TSCONFIG_PATH = resolve(SRC_DIR, "../tsconfig.json");

const EXPECTED_PULL_REQUEST_TS = [
	"import type {",
	"\tChange,",
	"\tFragment,",
	"\tLedger,",
	"\tLocationUrl,",
	"\tSurface,",
	"\tThreads,",
	'} from "./contracts.g.ts";',
	"",
	"export interface PullRequest {",
	"\treadonly change: Change;",
	"\treadonly surface: Surface;",
	"\treadonly fragments: readonly Fragment[];",
	"\treadonly threads: Threads;",
	"}",
	"",
	"export interface PullRequestRepository {",
	"\tread: () => Promise<PullRequest>;",
	"\tsubmit: (ledger: Ledger) => Promise<LocationUrl>;",
	"}",
	"",
].join("\n");

const CLASS_DECLARATION_RE = /\bclass\s+[A-Za-z0-9_]+/u;
const DOMAIN_TYPE_DECLARATION_RE = /\b(?:interface|type)\s+[A-Za-z0-9_]+/u;
const NON_CODEC_VALIDATION_RE =
	/\b(?:superRefine|refine|addIssue|safeParse|safeDecode)\s*\(|\bz\.(?:custom|object)\s*(?:<|\()/u;

it("src/domain/pull-request.ts is pinned verbatim and cannot be altered", () => {
	const actual = readFileSync(join(SRC_DIR, "domain/pull-request.ts"), "utf8");
	assert.equal(actual, EXPECTED_PULL_REQUEST_TS);
});

it("every source file in src/** is a .ts file checked by tsconfig.json", () => {
	const nonTsFiles = readdirSync(SRC_DIR, { recursive: true })
		.map(String)
		.filter((relPath) => !relPath.endsWith(".ts") && relPath.includes("."));
	assert.deepEqual(nonTsFiles, []);
});

it("only src/controller/** may declare classes", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("{src/domain/**,src/adapters/**,src/client/**}")
		.should()
		.adhereTo(
			(file) => !CLASS_DECLARATION_RE.test(file.content),
			"Only controllers in src/controller/ may be classes; domain, adapters, and client must be schema-defined data and codecs",
		)
		.check();
	assert.deepEqual(violations, []);
});

it("src/domain/** declares no interfaces or types outside contracts.g.ts and pull-request.ts", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inFolder("src/domain/**")
		.should()
		.adhereTo(
			(file) =>
				file.name === "contracts.g.ts" ||
				file.name === "pull-request.ts" ||
				file.name.endsWith(".test.ts") ||
				!DOMAIN_TYPE_DECLARATION_RE.test(file.content),
			"All domain shapes outside pull-request.ts must be defined in JSON Schema (contracts.g.ts)",
		)
		.check();
	assert.deepEqual(violations, []);
});

it("src/** contains zero non-codec parsing or validation outside contracts.g.ts", async () => {
	const violations = await projectFiles(TSCONFIG_PATH)
		.inPath("{src/domain/**,src/controller/**,src/adapters/**,src/client/**}")
		.should()
		.adhereTo(
			(file) =>
				file.name === "contracts.g.ts" ||
				file.name.endsWith(".test.ts") ||
				!NON_CODEC_VALIDATION_RE.test(file.content),
			"External input must be parsed with Schema.parse and converted with z.codec; superRefine, refine, addIssue, safeParse, safeDecode, z.custom, and z.object are forbidden",
		)
		.check();
	assert.deepEqual(violations, []);
});
