import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
	type AgentInstructions,
	AgentInstructionsSchema,
	type Checkout,
	CheckoutSchema,
} from "./contracts.g.ts";
import { LedgerDirectory } from "./ledger-directory.ts";
import { SnapshotDirectory } from "./snapshot-directory.ts";

export interface PersistedAudit {
	readonly name: Checkout;
	readonly document: AgentInstructions;
}

export class Workdir {
	readonly #path: Checkout;
	readonly #ledger: LedgerDirectory;
	readonly #snapshot: SnapshotDirectory;

	private constructor(
		path: Checkout,
		ledger: LedgerDirectory,
		snapshot: SnapshotDirectory,
	) {
		this.#path = path;
		this.#ledger = ledger;
		this.#snapshot = snapshot;
	}

	static readonly Schema = CheckoutSchema.transform((rawPath) => {
		const resolvedPath = resolve(rawPath);
		return {
			resolvedPath,
			ledgerPath: join(dirname(resolvedPath), "ledger"),
			snapshotPath: join(resolvedPath, "snapshot"),
		};
	})
		.pipe(
			z.object({
				resolvedPath: CheckoutSchema,
				ledgerPath: LedgerDirectory.Schema,
				snapshotPath: SnapshotDirectory.Schema,
			}),
		)
		.transform(
			({ resolvedPath, ledgerPath, snapshotPath }) =>
				new Workdir(resolvedPath, ledgerPath, snapshotPath),
		);

	static from(raw: Checkout): z.ZodSafeParseResult<Workdir> {
		return Workdir.Schema.safeParse(raw);
	}

	ledgerDirectory(): LedgerDirectory {
		return this.#ledger;
	}

	snapshotDirectory(): SnapshotDirectory {
		return this.#snapshot;
	}

	writeAudit(name: string, document: AgentInstructions): void {
		const dir = join(this.#path, "instructions");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, `${name}.json`),
			JSON.stringify(document, null, 2),
			"utf-8",
		);
	}

	readAudits(): readonly PersistedAudit[] {
		const dir = join(this.#path, "instructions");
		return readdirSync(dir)
			.filter((file) => file.endsWith(".json"))
			.sort()
			.map((file) => ({
				name: file.slice(0, -".json".length),
				document: AgentInstructionsSchema.parse(
					JSON.parse(readFileSync(join(dir, file), "utf-8")),
				),
			}));
	}

	equals(other: Workdir): boolean {
		return this.#path === other.#path;
	}

	toString(): Checkout {
		return this.#path;
	}
}
