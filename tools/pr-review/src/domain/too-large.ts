class TooLarge {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): TooLarge {
		return new TooLarge();
	}
}

export { TooLarge };
