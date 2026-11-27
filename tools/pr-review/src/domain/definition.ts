import type { Definition as DefinitionShape } from "../generated/domain/definition.g.ts";

class Definition {
	private readonly shape: DefinitionShape;

	private constructor(shape: DefinitionShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: DefinitionShape): Definition {
		return new Definition(shape);
	}

	static shapeOf(definition: Definition): DefinitionShape {
		return definition.shape;
	}
}

export { Definition };
