class NotDefined {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): NotDefined {
		return new NotDefined();
	}
}

export { NotDefined };
