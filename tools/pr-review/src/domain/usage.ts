import type { Usage as UsageShape } from "../generated/domain/usage.g.ts";
import type { Folding } from "./folding.ts";

class Usage {
	private readonly shape: UsageShape;

	private constructor(shape: UsageShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: UsageShape): Usage {
		return new Usage(shape);
	}

	foldedBy<Foreign>(contract: Folding<UsageShape, Foreign>): Foreign {
		return contract.encode(this.shape);
	}
}

export { Usage };
