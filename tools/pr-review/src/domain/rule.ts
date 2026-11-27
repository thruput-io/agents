import type { Rule as RuleShape } from "../generated/domain/rule.g.ts";
import type { Folding } from "./folding.ts";

class Rule {
	private readonly shape: RuleShape;

	private constructor(shape: RuleShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: RuleShape): Rule {
		return new Rule(shape);
	}

	foldedBy<Foreign>(contract: Folding<RuleShape, Foreign>): Foreign {
		return contract.encode(this.shape);
	}

	isSameAs(other: Rule): boolean {
		return this.shape === other.shape;
	}
}

export { Rule };
