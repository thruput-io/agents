import type { Session as SessionShape } from "../generated/domain/session.g.ts";

class Session {
	declare private readonly id: SessionShape["id"];
	declare private readonly directory: SessionShape["directory"];

	private constructor(shape: SessionShape) {
		this.id = shape.id;
		this.directory = shape.directory;
		Object.freeze(this);
	}
}

export { Session };
