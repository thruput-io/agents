// ruleid: no-type-tag-in-domain
class Tagged {
	private readonly kind = "tagged";

	named(): string {
		return this.kind;
	}
}

// ok: no-type-tag-in-domain
class Holding {
	private readonly held: string;

	private constructor(held: string) {
		this.held = held;
	}

	static of(held: string): Holding {
		return new Holding(held);
	}

	answer(): string {
		return this.held;
	}
}

export { Holding, Tagged };
