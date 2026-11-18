import type { LedgerStore } from "../domain/ports.ts";

interface ProbeStorage {
	readCursor: () => number | null;
	writeCursor: (index: number) => void;
	readAck: () => number | null;
	writeAck: (acknowledgedAt: number) => void;
}

function inMemoryProbeStorage(): ProbeStorage {
	const state = new Map<"cursor" | "ack", number>();
	return {
		readCursor: () => {
			const cursor = state.get("cursor");
			if (cursor === undefined) {
				return null;
			}
			return cursor;
		},
		writeCursor: (index) => {
			state.set("cursor", index);
		},
		readAck: () => {
			const acknowledgedAt = state.get("ack");
			if (acknowledgedAt === undefined) {
				return null;
			}
			return acknowledgedAt;
		},
		writeAck: (acknowledgedAt) => {
			state.set("ack", acknowledgedAt);
		},
	};
}

function persistedProbeStorage(
	directory: LedgerStore,
	name: string,
): ProbeStorage {
	return {
		readCursor: () => directory.readCursor(name),
		writeCursor: (index) => directory.writeCursor(name, index),
		readAck: () => directory.readAck(name),
		writeAck: (acknowledgedAt) => directory.writeAck(name, acknowledgedAt),
	};
}

export type { ProbeStorage };
export { inMemoryProbeStorage, persistedProbeStorage };
