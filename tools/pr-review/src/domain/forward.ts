class Forward {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): Forward {
		return new Forward();
	}
}

export { Forward };
