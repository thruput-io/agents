class HostError {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): HostError {
		return new HostError();
	}
}

export { HostError };
