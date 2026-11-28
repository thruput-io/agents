const stopping = (): never => {
	// ruleid: stop-only-where-not-yet-implemented
	throw new Error("stopped");
};

// ok: stop-only-where-not-yet-implemented
const answering = (): Error => new Error("answered");

export { answering, stopping };
