import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import type { Page } from "../generated/domain/page.g.ts";
import type { Rule } from "../generated/domain/rule.g.ts";
import { Assignment } from "./assignment.ts";
import { Back } from "./back.ts";
import { Forward } from "./forward.ts";
import { NoPage } from "./no-page.ts";
import { NotAcknowledged } from "./not-acknowledged.ts";
import { NotDefined } from "./not-defined.ts";
import {
	pageSample,
	probeSample,
	ruleSample,
	taskSample,
} from "./sample.test-support.ts";
import type { Task } from "./task.ts";
import { Term } from "./term.ts";
import { Verdict } from "./verdict.ts";

const first: Rule = ruleSample("Stated purpose");
const second: Rule = ruleSample("Delete unused");
const pages: readonly Page[] = [pageSample(), pageSample()];
const task: Task = taskSample(probeSample("probe-1"), [first, second]);
const sentence =
	"By sending this ack I acknowledge I read all instructions and implicitly I know how to use the review tool";
const briefed: Assignment = Assignment.of(task, pages);
const working: Assignment = briefed.after(
	Acknowledgement.codec.decode(sentence),
);

it("the instructions are answered before they are acknowledged", () => {
	assert.equal(briefed.briefing().instructions(), task.instructions);
});

it("the rules are not answered before the instructions are acknowledged", () => {
	const refused = Effect.runSync(Effect.flip(briefed.briefing().rules()));

	assert.equal(refused instanceof NotAcknowledged, true);
});

it("the standing before an acknowledgement is the detailed instructions", () => {
	assert.equal(Effect.runSync(Effect.flip(briefed.standing())), task.detailed);
});

it("an acknowledged assignment answers its rules", () => {
	assert.deepEqual(Effect.runSync(working.briefing().rules()), [first, second]);
});

it("an acknowledged assignment has every rule left to judge", () => {
	assert.deepEqual(Effect.runSync(working.standing()), [first, second]);
});

it("a judged rule is no longer left", () => {
	const judged: Assignment = working.after(Verdict.on(first));

	assert.deepEqual(Effect.runSync(judged.standing()), [second]);
});

it("a later verdict on the same rule replaces the earlier one", () => {
	const earlier: Verdict = Verdict.on(first);
	const later: Verdict = Verdict.on(first);
	const judged: Assignment = working.after(earlier).after(later);

	assert.deepEqual(judged.ledger().verdicts, [later]);
});

it("an assignment with every rule judged has nothing left", () => {
	const judged: Assignment = working
		.after(Verdict.on(first))
		.after(Verdict.on(second));

	assert.deepEqual(judged.ledger().remaining, []);
});

it("no page is answered before the instructions are acknowledged", () => {
	const turned: Assignment = briefed.after(Forward.create());
	const refused = Effect.runSync(Effect.flip(turned.briefing().page()));

	assert.equal(refused instanceof NotAcknowledged, true);
});

it("there is no page before the first turn", () => {
	const refused = Effect.runSync(Effect.flip(working.briefing().page()));

	assert.equal(refused instanceof NoPage, true);
});

it("turning forward answers the pages in order", () => {
	const once: Assignment = working.after(Forward.create());
	const twice: Assignment = once.after(Forward.create());

	assert.deepEqual(
		[
			Effect.runSync(once.briefing().page()),
			Effect.runSync(twice.briefing().page()),
		],
		pages,
	);
});

it("turning forward past the last page answers no page", () => {
	const past: Assignment = working
		.after(Forward.create())
		.after(Forward.create())
		.after(Forward.create());
	const refused = Effect.runSync(Effect.flip(past.briefing().page()));

	assert.equal(refused instanceof NoPage, true);
});

it("turning back answers the page before", () => {
	const back: Assignment = working
		.after(Forward.create())
		.after(Forward.create())
		.after(Back.create());

	assert.equal(Effect.runSync(back.briefing().page()), pages[0]);
});

it("a term the glossary holds is defined, however it is written", () => {
	const definition = briefed
		.briefing()
		.definitionOf(Effect.runSync(Term.of("[[LEDGER]]")));

	assert.equal(Effect.runSync(definition), task.glossary[0]?.[1]);
});

it("a term the glossary does not hold is not defined", () => {
	const refused = Effect.runSync(
		Effect.flip(
			briefed.briefing().definitionOf(Effect.runSync(Term.of("Nothing"))),
		),
	);

	assert.equal(refused instanceof NotDefined, true);
});
