import type { Definition as DefinitionShape } from "../generated/domain/definition.g.ts";
import type { Folding } from "./folding.ts";

class Definition {
	private readonly shape: DefinitionShape;

	private constructor(shape: DefinitionShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: DefinitionShape): Definition {
		return new Definition(shape);
	}

	foldedBy<Foreign>(contract: Folding<DefinitionShape, Foreign>): Foreign {
		return contract.encode(this.shape);
	}
}

export { Definition };
