import { AcknowledgementRequest } from "../generated/domain/acknowledgement-request.g.ts";
import { Context } from "../generated/domain/context.g.ts";
import { Usage } from "../generated/domain/usage.g.ts";
import { Workflow } from "../generated/domain/workflow.g.ts";

type NoData = Readonly<Record<string, never>>;

class Instructions {
	readonly #data: NoData = {};

	private constructor() {
		Object.freeze(this);
	}

	static create(): Instructions {
		return new Instructions();
	}

	static dataOf(value: Instructions): NoData {
		return value.#data;
	}

	workflow(): Workflow {
		return Workflow.create();
	}

	context(): Context {
		return Context.create();
	}

	usage(): Usage {
		return Usage.create();
	}

	request(): AcknowledgementRequest {
		return AcknowledgementRequest.create();
	}
}

export { Instructions };
