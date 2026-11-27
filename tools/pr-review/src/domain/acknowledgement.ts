import type { Acknowledgement as AcknowledgementShape } from "../generated/domain/acknowledgement.g.ts";

class Acknowledgement {
	private readonly shape: AcknowledgementShape;

	private constructor(shape: AcknowledgementShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: AcknowledgementShape): Acknowledgement {
		return new Acknowledgement(shape);
	}

	static shapeOf(acknowledgement: Acknowledgement): AcknowledgementShape {
		return acknowledgement.shape;
	}
}

export { Acknowledgement };
