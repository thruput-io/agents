class AlreadyReviewed {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): AlreadyReviewed {
		return new AlreadyReviewed();
	}
}

export { AlreadyReviewed };
