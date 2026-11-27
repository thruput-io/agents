import { z } from "zod";
import { Acknowledgement } from "../domain/acknowledgement.ts";
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
import { Acknowledgement as AcknowledgementShape } from "../generated/domain/acknowledgement.g.ts";
import { AcknowledgementRequest as AcknowledgementRequestShape } from "../generated/domain/acknowledgement-request.g.ts";
import { Context as ContextShape } from "../generated/domain/context.g.ts";
import { Definition as DefinitionShape } from "../generated/domain/definition.g.ts";
import { Page as PageShape } from "../generated/domain/page.g.ts";
import { Probe as ProbeShape } from "../generated/domain/probe.g.ts";
import { Rule as RuleShape } from "../generated/domain/rule.g.ts";
import { TargetUrl as TargetUrlShape } from "../generated/domain/target-url.g.ts";
import { Usage as UsageShape } from "../generated/domain/usage.g.ts";
import { Workdir as WorkdirShape } from "../generated/domain/workdir.g.ts";
import { Workflow as WorkflowShape } from "../generated/domain/workflow.g.ts";

const AcknowledgementCodec = z.codec(
	AcknowledgementShape,
	z.custom<Acknowledgement>(
		(value): boolean => value instanceof Acknowledgement,
	),
	{
		decode: Acknowledgement.of,
		encode: (acknowledgement: Acknowledgement): AcknowledgementShape =>
			acknowledgement.foldedBy(AcknowledgementShape),
	},
);

const AcknowledgementRequestCodec = z.codec(
	AcknowledgementRequestShape,
	z.custom<AcknowledgementRequest>(
		(value): boolean => value instanceof AcknowledgementRequest,
	),
	{
		decode: AcknowledgementRequest.of,
		encode: (
			acknowledgementRequest: AcknowledgementRequest,
		): AcknowledgementRequestShape =>
			acknowledgementRequest.foldedBy(AcknowledgementRequestShape),
	},
);

const ContextCodec = z.codec(
	ContextShape,
	z.custom<Context>((value): boolean => value instanceof Context),
	{
		decode: Context.of,
		encode: (context: Context): ContextShape => context.foldedBy(ContextShape),
	},
);

const DefinitionCodec = z.codec(
	DefinitionShape,
	z.custom<Definition>((value): boolean => value instanceof Definition),
	{
		decode: Definition.of,
		encode: (definition: Definition): DefinitionShape =>
			definition.foldedBy(DefinitionShape),
	},
);

const PageCodec = z.codec(
	PageShape,
	z.custom<Page>((value): boolean => value instanceof Page),
	{
		decode: Page.of,
		encode: (page: Page): PageShape => page.foldedBy(PageShape),
	},
);

const ProbeCodec = z.codec(
	ProbeShape,
	z.custom<Probe>((value): boolean => value instanceof Probe),
	{
		decode: Probe.of,
		encode: (probe: Probe): ProbeShape => probe.foldedBy(ProbeShape),
	},
);

const RuleCodec = z.codec(
	RuleShape,
	z.custom<Rule>((value): boolean => value instanceof Rule),
	{
		decode: Rule.of,
		encode: (rule: Rule): RuleShape => rule.foldedBy(RuleShape),
	},
);

const TargetUrlCodec = z.codec(
	TargetUrlShape,
	z.custom<TargetUrl>((value): boolean => value instanceof TargetUrl),
	{
		decode: TargetUrl.of,
		encode: (targetUrl: TargetUrl): TargetUrlShape =>
			targetUrl.foldedBy(TargetUrlShape),
	},
);

const UsageCodec = z.codec(
	UsageShape,
	z.custom<Usage>((value): boolean => value instanceof Usage),
	{
		decode: Usage.of,
		encode: (usage: Usage): UsageShape => usage.foldedBy(UsageShape),
	},
);

const WorkdirCodec = z.codec(
	WorkdirShape,
	z.custom<Workdir>((value): boolean => value instanceof Workdir),
	{
		decode: Workdir.of,
		encode: (workdir: Workdir): WorkdirShape => workdir.foldedBy(WorkdirShape),
	},
);

const WorkflowCodec = z.codec(
	WorkflowShape,
	z.custom<Workflow>((value): boolean => value instanceof Workflow),
	{
		decode: Workflow.of,
		encode: (workflow: Workflow): WorkflowShape =>
			workflow.foldedBy(WorkflowShape),
	},
);

export {
	AcknowledgementCodec,
	AcknowledgementRequestCodec,
	ContextCodec,
	DefinitionCodec,
	PageCodec,
	ProbeCodec,
	RuleCodec,
	TargetUrlCodec,
	UsageCodec,
	WorkdirCodec,
	WorkflowCodec,
};
