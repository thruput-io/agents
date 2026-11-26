import { Surface } from "../generated/domain/surface.g.ts";

class Cursor {
	readonly #kind = "cursor";

	private constructor() {
		Object.freeze(this);
	}

	static create(): Cursor {
		return new Cursor();
	}

	toJSON(): { readonly kind: string } {
		return { kind: this.#kind };
	}

	next(): Surface {
		return Surface.create();
	}

	previous(): Surface {
		return Surface.create();
	}
}

export { Cursor };
