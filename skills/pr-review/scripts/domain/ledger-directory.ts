import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
	type Change,
	ChangeSchema,
	type Checkout,
	CheckoutSchema,
	type Fragment,
	FragmentSchema,
	type Ledger,
	LedgerSchema,
	type Surface,
	SurfaceSchema,
	type Threads,
	ThreadsSchema,
} from "./contracts.g.ts";

const PULL_REQUEST_FILE = "pull-request.json";

const PersistedPullRequestSchema = z.object({
	change: ChangeSchema,
	surface: SurfaceSchema,
	fragments: z.array(FragmentSchema).readonly(),
	threads: ThreadsSchema,
});

export interface PersistedPullRequest {
	readonly change: Change;
	readonly surface: Surface;
	readonly fragments: readonly Fragment[];
	readonly threads: Threads;
}

export class LedgerDirectory {
	readonly #path: Checkout;

	private constructor(path: Checkout) {
		this.#path = path;
	}

	static readonly Schema = CheckoutSchema.transform(
		(path) => new LedgerDirectory(path),
	);

	static from(raw: Checkout): z.ZodSafeParseResult<LedgerDirectory> {
		return LedgerDirectory.Schema.safeParse(raw);
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
