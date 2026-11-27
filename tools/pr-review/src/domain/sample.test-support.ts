import { Effect } from "effect";
import { AcknowledgementRequest } from "../domain/acknowledgement-request.ts";
import { Context } from "../domain/context.ts";
import { Definition } from "../domain/definition.ts";
import { Page } from "../domain/page.ts";
import { Probe } from "../domain/probe.ts";
import { Rule } from "../domain/rule.ts";
import { TargetUrl } from "../domain/target-url.ts";
import { Usage } from "../domain/usage.ts";
import { Workdir } from "../domain/workdir.ts";
import { Workflow } from "../domain/workflow.ts";
import { Instructions } from "./instructions.ts";
import type { Task } from "./task.ts";
import { Term } from "./term.ts";

const instructionsSample = (): Instructions =>
	Instructions.of({
		workflow: Workflow.of({}),
		context: Context.of({}),
		usage: Usage.of({}),
		request: AcknowledgementRequest.of("a request"),
	});

const workdirSample = (): Workdir =>
	Reflect.construct(Workdir, [{ path: "/work" }]);

const ruleSample = (id: string): Rule => Rule.of(id);

const probeSample = (name: string): Probe => Probe.of(name);

const pageSample = (): Page => Page.of("a page");

const urlSample = (): TargetUrl => TargetUrl.of("https://host.test/change");

const taskSample = (probe: Probe, rules: readonly Rule[]): Task => ({
	probe,
	instructions: instructionsSample(),
	detailed: instructionsSample(),
	rules,
	glossary: [
		[Effect.runSync(Term.of("Ledger")), Definition.of("a definition")],
	],
});

export {
	instructionsSample,
	pageSample,
	probeSample,
	ruleSample,
	taskSample,
	urlSample,
	workdirSample,
};
