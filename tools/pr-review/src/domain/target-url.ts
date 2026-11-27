import type { TargetUrl as TargetUrlShape } from "../generated/domain/target-url.g.ts";
import type { Folding } from "./folding.ts";

class TargetUrl {
	private readonly shape: TargetUrlShape;

	private constructor(shape: TargetUrlShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: TargetUrlShape): TargetUrl {
		return new TargetUrl(shape);
	}

	foldedBy<Foreign>(contract: Folding<TargetUrlShape, Foreign>): Foreign {
		return contract.encode(this.shape);
	}
}

export { TargetUrl };
