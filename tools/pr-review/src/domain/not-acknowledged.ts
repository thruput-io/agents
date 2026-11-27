class NotAcknowledged {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): NotAcknowledged {
		return new NotAcknowledged();
	}
}

export { NotAcknowledged };
