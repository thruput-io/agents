class NotAssigned {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): NotAssigned {
		return new NotAssigned();
	}
}

export { NotAssigned };
