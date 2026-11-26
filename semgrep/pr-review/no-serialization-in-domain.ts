// ruleid: no-serialization-in-domain
class Serializing {
	toJSON(): string {
		return "x";
	}
}

// ruleid: no-serialization-in-domain
const printed = (value: object): string => JSON.stringify(value);

// ok: no-serialization-in-domain
class Answering {
	answer(): string {
		return "x";
	}
}

export { Answering, printed, Serializing };
