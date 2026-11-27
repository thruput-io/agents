interface Contract {
	readonly encode: (shape: string) => string;
}

interface Value {
	readonly foldedBy: (contract: Contract) => string;
	readonly isSameAs: (other: Value) => boolean;
}

// ruleid: fold-only-at-the-perimeter
const folded = (value: Value, contract: Contract): string => value.foldedBy(contract);

// ok: fold-only-at-the-perimeter
const compared = (value: Value, other: Value): boolean => value.isSameAs(other);

export { compared, folded };
