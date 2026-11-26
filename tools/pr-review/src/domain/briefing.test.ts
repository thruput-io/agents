import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Definition } from "../generated/domain/definition.g.ts";
import { Ruleset } from "../generated/domain/ruleset.g.ts";
import { Term } from "../generated/domain/term.g.ts";
import { Briefing } from "./briefing.ts";
import { Instructions } from "./instructions.ts";

it("a briefing holds the instructions", () => {
	assert.equal(Briefing.create().instructions() instanceof Instructions, true);
});

it("a briefing holds the ruleset", () => {
	assert.equal(Briefing.create().rules() instanceof Ruleset, true);
});

it("a briefing defines a term", () => {
	const definition = Briefing.create().definitionOf(Term.create());

	assert.equal(definition instanceof Definition, true);
});

it("a briefing serializes as its kind", () => {
	assert.deepEqual(Briefing.create().toJSON(), { kind: "briefing" });
});
