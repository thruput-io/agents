import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrepareDefaultResponse } from "../generated/integration-test/review-tool.g.ts";

interface Ran {
	readonly exitCode: number | null;
	readonly printed: string;
	readonly complained: string;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const tool = join(root, "skills/pr-review/dist/bin/review-tool.mjs");
const mockHost = "http://localhost:8617";
const served = `${mockHost}/first-review.git@main..first-review`;

const ran = (commandArguments: readonly string[]): Ran => {
	const { status, stdout, stderr } = spawnSync(
		process.execPath,
		[tool, ...commandArguments],
		{ encoding: "utf8" },
	);

	return { exitCode: status, printed: stdout, complained: stderr };
};

const emptyWorkdir = (): string =>
	mkdtempSync(join(tmpdir(), "integration-main-"));

const failureOf = ({
	exitCode,
	printed,
}: Ran): readonly [number | null, string] => [
	exitCode,
	PrepareDefaultResponse.parse(JSON.parse(printed)).failure,
];

it("help answers the two commands of the main agent", () => {
	const { exitCode, printed } = ran(["-h"]);

	assert.deepEqual(
		[exitCode, Object.keys(JSON.parse(printed).commands)],
		[0, ["prepare", "status"]],
	);
});

it("prepare without arguments is not valid", () => {
	assert.deepEqual(failureOf(ran(["prepare"])), [1, "not-valid"]);
});

it("prepare for an address no host recognises is of an unknown format", () => {
	assert.deepEqual(
		failureOf(ran(["prepare", `${mockHost}/first-review.git`, emptyWorkdir()])),
		[1, "unknown-format"],
	);
});

it("prepare for a repository the host does not serve is a host error", () => {
	assert.deepEqual(
		failureOf(
			ran([
				"prepare",
				`${mockHost}/missing.git@main..first-review`,
				emptyWorkdir(),
			]),
		),
		[1, "host-error"],
	);
});

it("status for a session that cannot be read is not valid", () => {
	assert.deepEqual(failureOf(ran(["status", "none"])), [1, "not-valid"]);
});

it("prepare stops where starting the sub agents is not implemented, and answers nothing", () => {
	const { exitCode, printed, complained } = ran([
		"prepare",
		served,
		emptyWorkdir(),
	]);

	assert.deepEqual(
		[
			exitCode,
			printed,
			complained.includes("not yet implemented: Agent.spawn"),
		],
		[1, "", true],
	);
});
