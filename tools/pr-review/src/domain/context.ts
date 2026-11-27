import type { Context as ContextShape } from "../generated/domain/context.g.ts";
import type { Folding } from "./folding.ts";

class Context {
	private readonly shape: ContextShape;

	private constructor(shape: ContextShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: ContextShape): Context {
		return new Context(shape);
	}

	foldedBy<Foreign>(contract: Folding<ContextShape, Foreign>): Foreign {
		return contract.encode(this.shape);
	}
}

export { Context };
