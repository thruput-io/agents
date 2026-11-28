import type { CreatedDir as CreatedDirShape } from "../generated/domain/created-dir.g.ts";

class CreatedDir {
	declare private readonly id: CreatedDirShape["id"];
	declare private readonly path: CreatedDirShape["path"];

	private constructor(shape: CreatedDirShape) {
		this.id = shape.id;
		this.path = shape.path;
		Object.freeze(this);
	}
}

export { CreatedDir };
