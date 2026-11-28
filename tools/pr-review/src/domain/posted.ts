class Posted {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): Posted {
		return new Posted();
	}
}

export { Posted };
