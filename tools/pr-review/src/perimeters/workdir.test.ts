import assert from "node:assert/strict";
import { test as it } from "node:test";
import { WorkdirCodec } from "./workdir.ts";

it("a workdir is encoded as the path it was decoded from", () => {
	assert.equal(WorkdirCodec.encode(WorkdirCodec.decode("/work")), "/work");
});

it("an empty path is not decoded", () => {
	assert.equal(WorkdirCodec.safeDecode("").success, false);
});
