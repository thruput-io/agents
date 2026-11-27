import type { Workdir as WorkdirShape } from "../generated/domain/workdir.g.ts";
import type { Folding } from "./folding.ts";

class Workdir {
	private readonly shape: WorkdirShape;

	private constructor(shape: WorkdirShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: WorkdirShape): Workdir {
		return new Workdir(shape);
	}

	foldedBy<Foreign>(contract: Folding<WorkdirShape, Foreign>): Foreign {
		return contract.encode(this.shape);
	}
}

export { Workdir };
