class NotValid {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): NotValid {
		return new NotValid();
	}
}

export { NotValid };
