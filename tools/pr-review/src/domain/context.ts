import type { Context as ContextShape } from "../generated/domain/context.g.ts";

class Context {
	private readonly shape: ContextShape;

	private constructor(shape: ContextShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: ContextShape): Context {
		return new Context(shape);
	}

	static shapeOf(context: Context): ContextShape {
		return context.shape;
	}
}

export { Context };
