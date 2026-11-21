import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as it } from "node:test";
import { Worker } from "node:worker_threads";
import type { Ledger, Row } from "../../domain/contracts.g.ts";
import { nonnull } from "../../domain/nullish.ts";
import { LedgerDirectory } from "./ledger-directory.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);
const cleanRow = (rule: string): Row => ({
	rule,
	examined: ["x"],
	verdict: "clean",
	evidence: "e",
});

const readSlicesUntilDone = async (
	dir: LedgerDirectory,
	isDone: () => boolean,
	collected: Ledger[],
): Promise<readonly Ledger[]> => {
	collected.push(nonnull(dir.readSlice("01-rules")));
	if (isDone()) {
		return collected;
	}
	await new Promise((resolve) => setImmediate(resolve));
	return readSlicesUntilDone(dir, isDone, collected);
};

it("LedgerDirectory.writeSlice writes atomically so concurrent readSlice calls never observe partial JSON", async () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "ledger-atomic-"));
	const dir = nonnull(LedgerDirectory.from(tempRoot).data);
	dir.initialize();
	const sampleLedger = {
		headCommit: H,
		rows: [cleanRow("A"), cleanRow("B")],
	};
	dir.writeSlice("01-rules", sampleLedger);
	const writer = new Worker(
		`const { workerData, parentPort } = require("node:worker_threads");
		const { LedgerDirectory } = require(workerData.modulePath);
		const dir = LedgerDirectory.from(workerData.tempRoot).data;
		for (let i = 0; i < 300; i += 1) {
			dir.writeSlice("01-rules", workerData.sampleLedger);
		}
		parentPort.postMessage("done");`,
		{
			eval: true,
			workerData: {
				modulePath: new URL("./ledger-directory.ts", import.meta.url).pathname,
				tempRoot,
				sampleLedger,
			},
		},
	);
	let done = false;
	writer.on("message", () => {
		done = true;
	});
	try {
		const slices = await readSlicesUntilDone(dir, () => done, []);
		assert.equal(slices.length > 0, true);
		assert.equal(
			slices.every(
				(slice) => slice.headCommit === H && slice.rows.length === 2,
			),
			true,
		);
	} finally {
		await writer.terminate();
		rmSync(tempRoot, { recursive: true, force: true });
	}
});
