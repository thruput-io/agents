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
import { Workflow as WorkflowShape } from "../generated/domain/workflow.g.ts";

const AcknowledgementCodec = z.codec(
	AcknowledgementShape,
	z.custom<Acknowledgement>(
		(value): boolean => value instanceof Acknowledgement,
	),
	{ decode: Acknowledgement.of, encode: Acknowledgement.shapeOf },
);

const AcknowledgementRequestCodec = z.codec(
	AcknowledgementRequestShape,
	z.custom<AcknowledgementRequest>(
		(value): boolean => value instanceof AcknowledgementRequest,
	),
	{ decode: AcknowledgementRequest.of, encode: AcknowledgementRequest.shapeOf },
);

const ContextCodec = z.codec(
	ContextShape,
	z.custom<Context>((value): boolean => value instanceof Context),
	{ decode: Context.of, encode: Context.shapeOf },
);

const DefinitionCodec = z.codec(
	DefinitionShape,
	z.custom<Definition>((value): boolean => value instanceof Definition),
	{ decode: Definition.of, encode: Definition.shapeOf },
);

const PageCodec = z.codec(
	PageShape,
	z.custom<Page>((value): boolean => value instanceof Page),
	{ decode: Page.of, encode: Page.shapeOf },
);

const ProbeCodec = z.codec(
	ProbeShape,
	z.custom<Probe>((value): boolean => value instanceof Probe),
	{ decode: Probe.of, encode: Probe.shapeOf },
);

const RuleCodec = z.codec(
	RuleShape,
	z.custom<Rule>((value): boolean => value instanceof Rule),
	{ decode: Rule.of, encode: Rule.shapeOf },
);

const TargetUrlCodec = z.codec(
	TargetUrlShape,
	z.custom<TargetUrl>((value): boolean => value instanceof TargetUrl),
	{ decode: TargetUrl.of, encode: TargetUrl.shapeOf },
);

const UsageCodec = z.codec(
	UsageShape,
	z.custom<Usage>((value): boolean => value instanceof Usage),
	{ decode: Usage.of, encode: Usage.shapeOf },
);

const WorkflowCodec = z.codec(
	WorkflowShape,
	z.custom<Workflow>((value): boolean => value instanceof Workflow),
	{ decode: Workflow.of, encode: Workflow.shapeOf },
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
	WorkflowCodec,
};
