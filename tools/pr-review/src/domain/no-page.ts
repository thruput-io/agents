class NoPage {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): NoPage {
		return new NoPage();
	}
}

export { NoPage };
