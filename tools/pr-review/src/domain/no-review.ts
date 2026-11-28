class NoReview {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): NoReview {
		return new NoReview();
	}
}

export { NoReview };
