import type { CreatedDir } from "./created-dir.ts";

class Session {
	declare private readonly directory: CreatedDir;

	private constructor(directory: CreatedDir) {
		this.directory = directory;
		Object.freeze(this);
	}

	static in(directory: CreatedDir): Session {
		return new Session(directory);
	}
}

export { Session };
