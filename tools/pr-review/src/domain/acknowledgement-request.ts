import type { AcknowledgementRequest as AcknowledgementRequestShape } from "../generated/domain/acknowledgement-request.g.ts";

class AcknowledgementRequest {
	private readonly shape: AcknowledgementRequestShape;

	private constructor(shape: AcknowledgementRequestShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: AcknowledgementRequestShape): AcknowledgementRequest {
		return new AcknowledgementRequest(shape);
	}

	static shapeOf(
		acknowledgementRequest: AcknowledgementRequest,
	): AcknowledgementRequestShape {
		return acknowledgementRequest.shape;
	}
}

export { AcknowledgementRequest };
