import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { type Checkout, CheckoutSchema, type Ledger } from "./contracts.g.ts";

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

	writeSlice(name: string, ledger: Ledger): void {
		mkdirSync(this.#path, { recursive: true });
		writeFileSync(
			join(this.#path, `${name}.json`),
			JSON.stringify(ledger, null, 2),
			"utf-8",
		);
	}

	equals(other: LedgerDirectory): boolean {
		return this.#path === other.#path;
	}

	toString(): Checkout {
		return this.#path;
	}
}
