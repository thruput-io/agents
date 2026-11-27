import type { Usage as UsageShape } from "../generated/domain/usage.g.ts";

class Usage {
	private readonly shape: UsageShape;

	private constructor(shape: UsageShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: UsageShape): Usage {
		return new Usage(shape);
	}

	static shapeOf(usage: Usage): UsageShape {
		return usage.shape;
	}
}

export { Usage };
