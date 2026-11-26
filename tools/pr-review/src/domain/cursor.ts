import type { Surface } from "../generated/domain/surface.g.ts";

class Cursor {
	private readonly following: Surface;
	private readonly preceding: Surface;

	private constructor(following: Surface, preceding: Surface) {
		this.following = following;
		this.preceding = preceding;
		Object.freeze(this);
	}

	static of(following: Surface, preceding: Surface): Cursor {
		return new Cursor(following, preceding);
	}

	next(): Surface {
		return this.following;
	}

	previous(): Surface {
		return this.preceding;
	}
}

export { Cursor };
