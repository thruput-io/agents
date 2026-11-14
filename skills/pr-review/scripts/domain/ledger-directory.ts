import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
	AckRecordSchema,
	type Checkout,
	CheckoutSchema,
	CursorRecordSchema,
	type Ledger,
	LedgerSchema,
	type PersistedPullRequest,
	PersistedPullRequestSchema,
	PersistedRulesetsSchema,
	type Rulebook,
} from "./contracts.g.ts";

export type { PersistedPullRequest } from "./contracts.g.ts";

const PULL_REQUEST_FILE = "pull-request.json";
const RULESETS_FILE = "rulesets.json";

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

	initialize(): void {
		rmSync(this.#path, { recursive: true, force: true });
		mkdirSync(this.#path, { recursive: true });
		writeFileSync(join(this.#path, ".operational"), "ok\n", "utf-8");
	}

	writePullRequest(pullRequest: PersistedPullRequest): void {
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

	writeRulesets(rulesets: readonly Rulebook[]): void {
		writeFileSync(
			join(this.#path, RULESETS_FILE),
			JSON.stringify({ rulesets }, null, 2),
			"utf-8",
		);
	}

	readRulesets(): readonly Rulebook[] {
		const rulesetsPath = join(this.#path, RULESETS_FILE);
		if (!existsSync(rulesetsPath)) {
			return [];
		}
		return PersistedRulesetsSchema.parse(
			JSON.parse(readFileSync(rulesetsPath, "utf-8")),
		).rulesets;
	}

	writeCursor(name: string, index: number): void {
		writeFileSync(
			join(this.#path, `${name}.cursor.json`),
			JSON.stringify({ index }, null, 2),
			"utf-8",
		);
	}

	readCursor(name: string): number | null {
		const cursorPath = join(this.#path, `${name}.cursor.json`);
		if (!existsSync(cursorPath)) {
			return null;
		}
		return CursorRecordSchema.parse(
			JSON.parse(readFileSync(cursorPath, "utf-8")),
		).index;
	}

	equals(other: LedgerDirectory): boolean {
		return this.#path === other.#path;
	}

	toString(): Checkout {
		return this.#path;
	}
}
