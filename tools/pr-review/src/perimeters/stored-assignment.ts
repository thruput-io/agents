import { z } from "zod";
import { Assignment, type AssignmentParts } from "../domain/assignment.ts";
import {
	Instructions,
	type InstructionsParts,
} from "../domain/instructions.ts";
import type { Rule } from "../domain/rule.ts";
import { Verdict } from "../domain/verdict.ts";
import { TermCodec } from "./term.ts";
import {
	AcknowledgementCodec,
	AcknowledgementRequestCodec,
	ContextCodec,
	DefinitionCodec,
	PageCodec,
	ProbeCodec,
	RuleCodec,
	UsageCodec,
	WorkflowCodec,
} from "./values.ts";

interface Judged {
	readonly rule: Rule;
}

const VerdictCodec = z.codec(
	z.object({ rule: RuleCodec }),
	z.custom<Verdict>((value): boolean => value instanceof Verdict),
	{
		decode: ({ rule }: Judged): Verdict => Verdict.on(rule),
		encode: (verdict: Verdict): Judged => ({ rule: Verdict.ruleOf(verdict) }),
	},
);

const InstructionsCodec = z.codec(
	z.object({
		workflow: WorkflowCodec,
		context: ContextCodec,
		usage: UsageCodec,
		request: AcknowledgementRequestCodec,
	}),
	z.custom<Instructions>((value): boolean => value instanceof Instructions),
	{
		decode: (parts: InstructionsParts): Instructions => Instructions.of(parts),
		encode: (instructions: Instructions): InstructionsParts =>
			Instructions.partsOf(instructions),
	},
);

const TaskShape = z.object({
	probe: ProbeCodec,
	instructions: InstructionsCodec,
	detailed: InstructionsCodec,
	rules: z.array(RuleCodec).readonly(),
	glossary: z
		.array(z.tuple([TermCodec, DefinitionCodec]).readonly())
		.readonly(),
});

const HappenedShape = z.object({
	acknowledgements: z.array(AcknowledgementCodec).readonly(),
	verdicts: z.array(VerdictCodec).readonly(),
	position: z.int(),
});

const AssignmentCodec = z.codec(
	z.object({
		task: TaskShape,
		pages: z.array(PageCodec).readonly(),
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
