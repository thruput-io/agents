import { z } from "zod";
import { Assignment, type AssignmentParts } from "../domain/assignment.ts";
import {
	Instructions,
	type InstructionsParts,
} from "../domain/instructions.ts";
import { Verdict } from "../domain/verdict.ts";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Definition } from "../generated/domain/definition.g.ts";
import { Page } from "../generated/domain/page.g.ts";
import { Probe } from "../generated/domain/probe.g.ts";
import { Rule } from "../generated/domain/rule.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";
import { TermCodec } from "./term.ts";

interface Judged {
	readonly rule: Rule;
}

const VerdictCodec = z.codec(
	z.object({ rule: Rule.codec }),
	z.custom<Verdict>((value): boolean => value instanceof Verdict),
	{
		decode: ({ rule }: Judged): Verdict => Verdict.on(rule),
		encode: (verdict: Verdict): Judged => ({ rule: Verdict.ruleOf(verdict) }),
	},
);

const InstructionsCodec = z.codec(
	z.object({
		workflow: Workflow.codec,
		context: Context.codec,
		usage: Usage.codec,
		request: AcknowledgementRequest.codec,
	}),
	z.custom<Instructions>((value): boolean => value instanceof Instructions),
	{
		decode: (parts: InstructionsParts): Instructions => Instructions.of(parts),
		encode: (instructions: Instructions): InstructionsParts =>
			Instructions.partsOf(instructions),
	},
);

const TaskShape = z.object({
	probe: Probe.codec,
	instructions: InstructionsCodec,
	detailed: InstructionsCodec,
	rules: z.array(Rule.codec).readonly(),
	glossary: z
		.array(z.tuple([TermCodec, Definition.codec]).readonly())
		.readonly(),
});

const HappenedShape = z.object({
	acknowledgements: z.array(Acknowledgement.codec).readonly(),
	verdicts: z.array(VerdictCodec).readonly(),
	position: z.int(),
});

const AssignmentCodec = z.codec(
	z.object({
		task: TaskShape,
		pages: z.array(Page.codec).readonly(),
		happened: HappenedShape,
	}),
	z.custom<Assignment>((value): boolean => value instanceof Assignment),
	{
		decode: (parts: AssignmentParts): Assignment => Assignment.from(parts),
		encode: (assignment: Assignment): AssignmentParts =>
			Assignment.partsOf(assignment),
	},
);

export { AssignmentCodec, VerdictCodec };
