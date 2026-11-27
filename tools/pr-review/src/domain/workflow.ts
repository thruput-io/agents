import type { Workflow as WorkflowShape } from "../generated/domain/workflow.g.ts";
import type { Folding } from "./folding.ts";

class Workflow {
	private readonly shape: WorkflowShape;

	private constructor(shape: WorkflowShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: WorkflowShape): Workflow {
		return new Workflow(shape);
	}

	foldedBy<Foreign>(contract: Folding<WorkflowShape, Foreign>): Foreign {
		return contract.encode(this.shape);
	}
}

export { Workflow };
