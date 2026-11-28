class Back {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): Back {
		return new Back();
	}
}

export { Back };
