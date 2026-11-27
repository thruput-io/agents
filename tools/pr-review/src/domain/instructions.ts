import type { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import type { Context } from "../generated/domain/context.g.ts";
import type { Usage } from "../generated/domain/usage.g.ts";
import type { Workflow } from "../generated/domain/workflow.g.ts";

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

	static of(parts: InstructionsParts): Instructions {
		return new Instructions(parts);
	}

	static partsOf(instructions: Instructions): InstructionsParts {
		return instructions.parts;
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

export type { InstructionsParts };
export { Instructions };
