import type { Workdir as WorkdirShape } from "../generated/domain/workdir.g.ts";

class Workdir {
	private readonly shape: WorkdirShape;

	private constructor(shape: WorkdirShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: WorkdirShape): Workdir {
		return new Workdir(shape);
	}

	static shapeOf(workdir: Workdir): WorkdirShape {
		return workdir.shape;
	}
}

export { Workdir };
