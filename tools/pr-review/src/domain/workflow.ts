import type { Workflow as WorkflowShape } from "../generated/domain/workflow.g.ts";

class Workflow {
	private readonly shape: WorkflowShape;

	private constructor(shape: WorkflowShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: WorkflowShape): Workflow {
		return new Workflow(shape);
	}

	static shapeOf(workflow: Workflow): WorkflowShape {
		return workflow.shape;
	}
}

export { Workflow };
