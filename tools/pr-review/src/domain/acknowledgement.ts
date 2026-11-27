import type { Acknowledgement as AcknowledgementShape } from "../generated/domain/acknowledgement.g.ts";
import type { Folding } from "./folding.ts";

class Acknowledgement {
	private readonly shape: AcknowledgementShape;

	private constructor(shape: AcknowledgementShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: AcknowledgementShape): Acknowledgement {
		return new Acknowledgement(shape);
	}

	foldedBy<Foreign>(contract: Folding<AcknowledgementShape, Foreign>): Foreign {
		return contract.encode(this.shape);
	}
}

export { Acknowledgement };
