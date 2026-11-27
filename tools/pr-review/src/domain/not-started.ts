class NotStarted {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): NotStarted {
		return new NotStarted();
	}
}

export { NotStarted };
