import { Surface } from "../generated/domain/surface.g.ts";

type NoData = Readonly<Record<string, never>>;

class Cursor {
	readonly #data: NoData = {};

	private constructor() {
		Object.freeze(this);
	}

	static create(): Cursor {
		return new Cursor();
	}

	static dataOf(value: Cursor): NoData {
		return value.#data;
	}

	next(): Surface {
		return Surface.create();
	}

	previous(): Surface {
		return Surface.create();
	}
}

export { Cursor };
