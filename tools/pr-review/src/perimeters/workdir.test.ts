import assert from "node:assert/strict";
import { test as it } from "node:test";
import { paramsOf, workdirIn } from "./workdir.ts";

it("a workdir gives back the parameters it was made from", () => {
	assert.deepEqual(paramsOf(workdirIn({ workdir: "/work" })), {
		workdir: "/work",
	});
});

it("parameters with an empty path hold no workdir", () => {
	assert.throws(
		(): ReturnType<typeof paramsOf> => paramsOf(workdirIn({ workdir: "" })),
	);
});
