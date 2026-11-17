import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
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

const writeJsonAtomically = (targetPath: string, payload: unknown): void => {
	const tempPath = `${targetPath}.${randomUUID()}.tmp`;
	writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf-8");
	renameSync(tempPath, targetPath);
};

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
		writeJsonAtomically(join(this.#path, PULL_REQUEST_FILE), pullRequest);
	}

	readPullRequest(): PersistedPullRequest {
		return PersistedPullRequestSchema.parse(
			JSON.parse(readFileSync(join(this.#path, PULL_REQUEST_FILE), "utf-8")),
		);
	}

	writeAck(name: string, acknowledgedAt: number): void {
		writeJsonAtomically(join(this.#path, `${name}.ack.json`), {
			acknowledgedAt,
		});
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
		writeJsonAtomically(join(this.#path, `${name}.json`), ledger);
	}

	readSlice(name: string): Ledger | null {
		const slicePath = join(this.#path, `${name}.json`);
		if (!existsSync(slicePath)) {
			return null;
		}
		return LedgerSchema.parse(JSON.parse(readFileSync(slicePath, "utf-8")));
	}

	writeRulesets(rulesets: readonly Rulebook[]): void {
		writeJsonAtomically(join(this.#path, RULESETS_FILE), { rulesets });
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
		writeJsonAtomically(join(this.#path, `${name}.cursor.json`), { index });
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
