import assert from "node:assert/strict";
import { test as it } from "node:test";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";
import { Instructions } from "./instructions.ts";

it("instructions hold a workflow", () => {
	assert.equal(Instructions.create().workflow() instanceof Workflow, true);
});

it("instructions hold a context", () => {
	assert.equal(Instructions.create().context() instanceof Context, true);
});

it("instructions hold a usage", () => {
	assert.equal(Instructions.create().usage() instanceof Usage, true);
});

it("instructions end with an acknowledgement request", () => {
	const request = Instructions.create().request();

	assert.equal(request instanceof AcknowledgementRequest, true);
});

it("instructions serialize as their kind", () => {
	assert.deepEqual(Instructions.create().toJSON(), { kind: "instructions" });
});
