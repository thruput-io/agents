class Refused {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): Refused {
		return new Refused();
	}
}

export { Refused };
