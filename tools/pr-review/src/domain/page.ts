import type { Page as PageShape } from "../generated/domain/page.g.ts";

class Page {
	private readonly shape: PageShape;

	private constructor(shape: PageShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: PageShape): Page {
		return new Page(shape);
	}

	static shapeOf(page: Page): PageShape {
		return page.shape;
	}
}

export { Page };
