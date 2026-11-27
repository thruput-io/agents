import type { TargetUrl as TargetUrlShape } from "../generated/domain/target-url.g.ts";

class TargetUrl {
	private readonly shape: TargetUrlShape;

	private constructor(shape: TargetUrlShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: TargetUrlShape): TargetUrl {
		return new TargetUrl(shape);
	}

	static shapeOf(targetUrl: TargetUrl): TargetUrlShape {
		return targetUrl.shape;
	}
}

export { TargetUrl };
