class NotDue {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): NotDue {
		return new NotDue();
	}
}

export { NotDue };
