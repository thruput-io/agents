class WorkdirFailed {
	declare private readonly nominal: never;
	private constructor() {
		Object.freeze(this);
	}
	static create(): WorkdirFailed {
		return new WorkdirFailed();
	}
}

export { WorkdirFailed };
