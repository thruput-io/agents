const minted = new WeakSet<object>();

const mint = <Whole extends object>(whole: Whole): Readonly<Whole> => {
	const frozen = Object.freeze(whole);

	minted.add(frozen);

	return frozen;
};

const isMinted = (value: object): boolean => minted.has(value);

export { isMinted, mint };
