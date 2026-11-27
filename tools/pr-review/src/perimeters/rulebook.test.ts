import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Rule } from "../domain/rule.ts";
import type { Task } from "../domain/task.ts";
import type { Workdir } from "../domain/workdir.ts";
import { probeIn } from "./disk.ts";
import { probesIn } from "./rulebook.ts";
import { TermCodec } from "./term.ts";
import {
	AcknowledgementCodec,
	AcknowledgementRequestCodec,
	DefinitionCodec,
	RuleCodec,
} from "./values.ts";
import { prepareDto } from "./workdir.ts";

const workdir: Workdir = prepareDto({ workdir: "/work" }).toDomain();
const purpose = probeIn(workdir, "purpose");

const taskOfPurpose = (): readonly Task[] =>
	probesIn(workdir).filter((task: Task): boolean =>
		task.probe.isSameAs(purpose),
	);

const rulesOf = (task: Task): readonly string[] =>
	task.rules.map((rule: Rule): string => RuleCodec.encode(rule));

const startOf = (task: Task, asked: string): string =>
	Effect.runSync(
		Effect.fromNullishOr(
			task.glossary.find(([term]): boolean =>
				term.isSameAs(TermCodec.decode(asked)),
			),
		).pipe(
			Effect.map(([, definition]): string =>
				DefinitionCodec.encode(definition).slice(0, "State the".length),
			),
		),
	);

const startsIn = (task: Task): readonly string[] =>
	["stated purpose", "do one thing", "pull request"].map(
		(asked: string): string => startOf(task, asked),
	);

it("the probe of a group holds a place in the workdir and is handed the rules of that group", () => {
	const rules = taskOfPurpose().map(rulesOf);

	assert.deepEqual(rules, [
		[
			"Stated purpose",
			"Every part solves the Purpose",
			"Predictable user-facing behavior",
			"No speculative portability",
			"Keep pull requests small",
			"Make it work first",
		],
	]);
});

it("no rule is handed to two probes", () => {
	const handed = probesIn(workdir).flatMap(rulesOf);

	assert.equal(new Set(handed).size, handed.length);
});

it("the glossary of a probe defines a rule, a principle and a definition", () => {
	const defined = taskOfPurpose().flatMap(startsIn);

	assert.deepEqual(defined.slice(0, 1), ["State the"]);
	assert.equal(defined.length, "abc".length);
});

it("the instructions of a probe end by asking for the sentence the acknowledgement accepts", () => {
	const asked = taskOfPurpose().map((task: Task): string =>
		AcknowledgementRequestCodec.encode(task.instructions.request()),
	);
	const sentences = asked.map(
		(text: string): boolean =>
			AcknowledgementCodec.safeParse(text.slice(text.indexOf("By sending")))
				.success,
	);

	assert.deepEqual(
		[asked, sentences],
		[
			[
				"Acknowledge these instructions by sending exactly this sentence with the ack command: By sending this ack I acknowledge I read all instructions and implicitly I know how to use the review tool",
			],
			[true],
		],
	);
});
