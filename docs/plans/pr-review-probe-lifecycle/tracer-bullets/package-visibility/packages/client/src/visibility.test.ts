import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import { assignFromWire } from "./index.ts";

const wireChange = { author: "octocat", description: "Tidy the parser" };
const wireProbe = { name: "dead-code", group: "Dead Code" };

const friendModule: string = "@bullet/core/src/internal.ts";
const undeclaredReach: string = "@bullet/controller/undeclared";
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));

it("the client parses, the controller calls the domain, and the client encodes, through public entry points only", () => {
	assert.deepEqual(assignFromWire(wireChange, wireProbe), {
		author: "octocat",
		probe: "dead-code",
		group: "Dead Code",
	});
});

it("the friend module cannot be imported from outside its package at runtime", async () => {
	await assert.rejects(import(friendModule), {
		code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
	});
});

it("a package that does not declare the codecs can still import them at runtime", async () => {
	const reached = await import(undeclaredReach);

	assert.equal(reached.parsesInTheController(wireChange), true);
});

it("the unused-code checker reports the undeclared import of the codecs", () => {
	const knip = spawnSync("npx", ["knip", "--no-progress"], {
		cwd: workspaceRoot,
		encoding: "utf8",
	});

	assert.equal(knip.stderr, "");
	assert.match(knip.stdout, /Unlisted dependencies/u);
	assert.match(
		knip.stdout,
		/@bullet\/core\s+packages\/controller\/src\/reaches-perimeters-undeclared\.ts/u,
	);
});
