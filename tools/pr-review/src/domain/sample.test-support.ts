import { Effect } from "effect";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { Page } from "../generated/domain/page.g.ts";
import { Probe } from "../generated/domain/probe.g.ts";
import { Rule } from "../generated/domain/rule.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";
import { Instructions } from "./instructions.ts";
import type { Task } from "./task.ts";
import { Term } from "./term.ts";

const instructionsSample = (): Instructions =>
	Instructions.of({
		workflow: Workflow.codec.decode({}),
		context: Context.codec.decode({}),
		usage: Usage.codec.decode({}),
		request: AcknowledgementRequest.codec.decode("a request"),
	});

const ruleSample = (id: string): Rule => Rule.codec.decode(id);

const probeSample = (name: string): Probe => Probe.codec.decode(name);

const pageSample = (): Page => Page.codec.decode("a page");

const urlSample = (): TargetUrl =>
	TargetUrl.codec.decode("https://host.test/change");

const taskSample = (probe: Probe, rules: readonly Rule[]): Task => ({
	probe,
	instructions: instructionsSample(),
	detailed: instructionsSample(),
	rules,
	glossary: [
		[
			Effect.runSync(Term.of("Ledger")),
			Definition.codec.decode("a definition"),
		],
	],
});

export {
	instructionsSample,
	pageSample,
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
};
