import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Effect } from "effect";
import type { Task } from "../domain/task.ts";
import { Term } from "../domain/term.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { Rule } from "../generated/domain/rule.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";
import { probeIn } from "./disk.ts";
import { probesIn } from "./rulebook.ts";

const workdir: Workdir = Workdir.codec.decode("/work");
const purpose = probeIn(workdir, "purpose");

const taskOfPurpose = (): readonly Task[] =>
	probesIn(workdir).filter((task: Task): boolean =>
		task.probe.isSameAs(purpose),
	);

it("the probe of a group holds a place in the workdir and is handed the rules of that group", () => {
	const rules = taskOfPurpose().map((task: Task): readonly string[] =>
		task.rules.map((rule: Rule): string => Rule.codec.encode(rule)),
	);

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
	const handed = probesIn(workdir).flatMap((task: Task): readonly string[] =>
		task.rules.map((rule: Rule): string => Rule.codec.encode(rule)),
	);

	assert.equal(new Set(handed).size, handed.length);
});

it("the glossary of a probe defines a rule, a principle and a definition", () => {
	const defined = taskOfPurpose().flatMap((task: Task): readonly string[] =>
		["stated purpose", "do one thing", "pull request"].map(
			(asked: string): string =>
				Effect.runSync(
					Effect.fromNullishOr(
						task.glossary.find(([term]): boolean =>
							term.isSameAs(Term.codec.decode(asked)),
						),
					).pipe(
						Effect.map(([, definition]): string =>
							Definition.codec.encode(definition).slice(0, "State the".length),
						),
					),
				),
		),
	);

	assert.deepEqual(defined.slice(0, 1), ["State the"]);
	assert.equal(defined.length, "abc".length);
});
