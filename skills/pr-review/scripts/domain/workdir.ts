import {
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
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

const SESSION_PREFIX = "pr-review-session:";
const SYSTEM_PRIVATE_PREFIX_RE = /^\/private(?=\/(?:var|tmp)(?:\/|$))/u;

const normalizeSystemRealpath = (path: string): string =>
	path.replace(SYSTEM_PRIVATE_PREFIX_RE, "");

const establishOperationalWorkdir = (
	resolvedPath: string,
):
	| { readonly ok: true; readonly symlinked: boolean }
	| { readonly ok: false; readonly message: string } => {
	try {
		const ledgerPath = join(dirname(resolvedPath), "ledger");
		mkdirSync(resolvedPath, { recursive: true });
		mkdirSync(ledgerPath, { recursive: true });
		writeFileSync(join(resolvedPath, ".operational"), "ok\n", "utf-8");
		writeFileSync(join(ledgerPath, ".operational"), "ok\n", "utf-8");
		const realResolved = realpathSync(resolvedPath);
		const symlinked =
			normalizeSystemRealpath(realResolved) !==
			normalizeSystemRealpath(resolvedPath);
		return { ok: true, symlinked };
	} catch (error) {
		return {
			ok: false,
			message:
				error instanceof Error
					? error.message
					: "Workdir is not operational for writing",
		};
	}
};

export class Workdir {
	readonly #path: Checkout;
	readonly #ledger: LedgerDirectory;
	readonly #snapshot: SnapshotDirectory;
	readonly #symlinked: boolean;

	private constructor(
		path: Checkout,
		ledger: LedgerDirectory,
		snapshot: SnapshotDirectory,
		symlinked: boolean,
	) {
		this.#path = path;
		this.#ledger = ledger;
		this.#snapshot = snapshot;
		this.#symlinked = symlinked;
	}

	static readonly Schema = CheckoutSchema.superRefine((rawPath, ctx) => {
		const resolvedPath = resolve(rawPath);
		const status = establishOperationalWorkdir(resolvedPath);
		if (!status.ok) {
			ctx.addIssue({
				code: "custom",
				message: `Workdir is not writeable: ${status.message}`,
			});
		}
	})
		.transform((rawPath) => {
			const resolvedPath = resolve(rawPath);
			const status = establishOperationalWorkdir(resolvedPath);
			const symlinked = status.ok ? status.symlinked : false;
			return {
				resolvedPath,
				ledgerPath: join(dirname(resolvedPath), "ledger"),
				snapshotPath: join(resolvedPath, "snapshot"),
				symlinked,
			};
		})
		.pipe(
			z.object({
				resolvedPath: CheckoutSchema,
				ledgerPath: LedgerDirectory.Schema,
				snapshotPath: SnapshotDirectory.Schema,
				symlinked: z.boolean(),
			}),
		)
		.transform(
			({ resolvedPath, ledgerPath, snapshotPath, symlinked }) =>
				new Workdir(resolvedPath, ledgerPath, snapshotPath, symlinked),
		);

	static from(raw: Checkout): z.ZodSafeParseResult<Workdir> {
		return Workdir.Schema.safeParse(raw);
	}

	static fromSession(raw: string): z.ZodSafeParseResult<Workdir> {
		const decoded = raw.startsWith(SESSION_PREFIX)
			? Buffer.from(raw.slice(SESSION_PREFIX.length), "base64url").toString(
					"utf-8",
				)
			: raw;
		return Workdir.from(decoded);
	}

	sessionToken(): string {
		return `${SESSION_PREFIX}${Buffer.from(this.#path, "utf-8").toString("base64url")}`;
	}

	isSymlinked(): boolean {
		return this.#symlinked;
	}

	warning(): string | null {
		return this.#symlinked
			? `Workdir path '${this.#path}' traverses a symlink; prefer a canonical non-symlinked directory.`
			: null;
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
