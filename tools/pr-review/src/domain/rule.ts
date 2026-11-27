import type { Rule as RuleShape } from "../generated/domain/rule.g.ts";

class Rule {
	private readonly shape: RuleShape;

	private constructor(shape: RuleShape) {
		this.shape = shape;
		Object.freeze(this);
	}

	static of(shape: RuleShape): Rule {
		return new Rule(shape);
	}

	static shapeOf(rule: Rule): RuleShape {
		return rule.shape;
	}

	isSameAs(other: Rule): boolean {
		return this.shape === other.shape;
	}
}

export { Rule };
