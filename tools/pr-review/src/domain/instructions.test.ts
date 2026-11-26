import assert from "node:assert/strict";
import { test as it } from "node:test";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";
import { Instructions } from "./instructions.ts";

const parts = {
	workflow: Workflow.codec.decode({}),
	context: Context.codec.decode({}),
	usage: Usage.codec.decode({}),
	request: AcknowledgementRequest.codec.decode({}),
} as const;

it("instructions answer the workflow they hold", () => {
	assert.equal(Instructions.of(parts).workflow(), parts.workflow);
});

it("instructions answer the context they hold", () => {
	assert.equal(Instructions.of(parts).context(), parts.context);
});

it("instructions answer the usage they hold", () => {
	assert.equal(Instructions.of(parts).usage(), parts.usage);
});

it("instructions answer the acknowledgement request they hold", () => {
	assert.equal(Instructions.of(parts).request(), parts.request);
});
