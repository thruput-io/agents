import type { Probe as ProbeShape } from "../generated/domain/probe.g.ts";

class Probe {
	private readonly shape: ProbeShape;

	private constructor(shape: ProbeShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: ProbeShape): Probe {
		return new Probe(shape);
	}

	static shapeOf(probe: Probe): ProbeShape {
		return probe.shape;
	}

	isSameAs(other: Probe): boolean {
		return this.shape === other.shape;
	}
}

export { Probe };
