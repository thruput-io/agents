import type { Probe as ProbeShape } from "../generated/domain/probe.g.ts";
import type { Folding } from "./folding.ts";

class Probe {
	private readonly shape: ProbeShape;

	private constructor(shape: ProbeShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: ProbeShape): Probe {
		return new Probe(shape);
	}

	foldedBy<Foreign>(contract: Folding<ProbeShape, Foreign>): Foreign {
		return contract.encode(this.shape);
	}

	isSameAs(other: Probe): boolean {
		return this.shape === other.shape;
	}
}

export { Probe };
