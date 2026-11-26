import { z } from "zod";
import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";

interface InstructionsParts {
	readonly workflow: Workflow;
	readonly context: Context;
	readonly usage: Usage;
	readonly request: AcknowledgementRequest;
}

class Instructions {
	private readonly parts: InstructionsParts;

	private constructor(parts: InstructionsParts) {
		this.parts = parts;
		Object.freeze(this);
	}

	static readonly codec = z.codec(
		z.object({
			workflow: Workflow.codec,
			context: Context.codec,
			usage: Usage.codec,
			request: AcknowledgementRequest.codec,
		}),
		z.custom<Instructions>((value): boolean => value instanceof Instructions),
		{
			decode: (parts: InstructionsParts): Instructions =>
				new Instructions(parts),
			encode: (instructions: Instructions): InstructionsParts =>
				instructions.parts,
		},
	);

	static of(parts: InstructionsParts): Instructions {
		return new Instructions(parts);
	}

	workflow(): Workflow {
		return this.parts.workflow;
	}

	context(): Context {
		return this.parts.context;
	}

	usage(): Usage {
		return this.parts.usage;
	}

	request(): AcknowledgementRequest {
		return this.parts.request;
	}
}

export { Instructions };
