import type { Workdir as WorkdirShape } from "../generated/domain/workdir.g.ts";

class Workdir {
	declare private readonly path: WorkdirShape["path"];

	private constructor(shape: WorkdirShape) {
		this.path = shape.path;
		Object.freeze(this);
	}
}

export { Workdir };
