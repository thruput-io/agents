import type { Page as PageShape } from "../generated/domain/page.g.ts";
import type { Folding } from "./folding.ts";

class Page {
	private readonly shape: PageShape;

	private constructor(shape: PageShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: PageShape): Page {
		return new Page(shape);
	}

	foldedBy<Foreign>(contract: Folding<PageShape, Foreign>): Foreign {
		return contract.encode(this.shape);
	}
}

export { Page };
