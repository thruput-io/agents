import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
	AckRecordSchema,
	type Checkout,
	CheckoutSchema,
	type Ledger,
	LedgerSchema,
	type PersistedPullRequest,
	PersistedPullRequestSchema,
} from "./contracts.g.ts";

export type { PersistedPullRequest } from "./contracts.g.ts";

const PULL_REQUEST_FILE = "pull-request.json";

export class LedgerDirectory {
	readonly #path: Checkout;

	private constructor(path: Checkout) {
		this.#path = path;
	}

	static readonly Schema = z.codec(
		CheckoutSchema,
		z.custom<LedgerDirectory>(
			(val): val is LedgerDirectory => val instanceof LedgerDirectory,
		),
		{
			decode: (path) => new LedgerDirectory(path),
			encode: (dir) => dir.toString(),
		},
	);

	static from(raw: Checkout): z.ZodSafeParseResult<LedgerDirectory> {
		return LedgerDirectory.Schema.safeDecode(raw);
	}

	writePullRequest(pullRequest: PersistedPullRequest): void {
		mkdirSync(this.#path, { recursive: true });
		writeFileSync(
			join(this.#path, PULL_REQUEST_FILE),
			JSON.stringify(pullRequest, null, 2),
			"utf-8",
		);
	}

	readPullRequest(): PersistedPullRequest {
		return PersistedPullRequestSchema.parse(
			JSON.parse(readFileSync(join(this.#path, PULL_REQUEST_FILE), "utf-8")),
		);
	}

	writeAck(name: string, acknowledgedAt: number): void {
		mkdirSync(this.#path, { recursive: true });
		writeFileSync(
			join(this.#path, `${name}.ack.json`),
			JSON.stringify({ acknowledgedAt }, null, 2),
			"utf-8",
		);
	}

	readAck(name: string): number | null {
		const ackPath = join(this.#path, `${name}.ack.json`);
		if (!existsSync(ackPath)) {
			return null;
		}
		return AckRecordSchema.parse(JSON.parse(readFileSync(ackPath, "utf-8")))
			.acknowledgedAt;
	}

	writeSlice(name: string, ledger: Ledger): void {
		mkdirSync(this.#path, { recursive: true });
		writeFileSync(
			join(this.#path, `${name}.json`),
			JSON.stringify(ledger, null, 2),
			"utf-8",
		);
	}

	readSlice(name: string): Ledger | null {
		const slicePath = join(this.#path, `${name}.json`);
		if (!existsSync(slicePath)) {
			return null;
		}
		return LedgerSchema.parse(JSON.parse(readFileSync(slicePath, "utf-8")));
	}

	equals(other: LedgerDirectory): boolean {
		return this.#path === other.#path;
	}

	toString(): Checkout {
		return this.#path;
	}
}
