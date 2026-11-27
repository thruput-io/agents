class UnknownFormat {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): UnknownFormat {
		return new UnknownFormat();
	}
}

export { UnknownFormat };
