import {
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
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

interface PersistedAudit {
	readonly name: Checkout;
	readonly document: AgentInstructions;
}

const SESSION_PREFIX = "pr-review-session:";
const SYSTEM_PRIVATE_PREFIX_RE = /^\/private(?=\/(?:var|tmp)(?:\/|$))/u;

const normalizeSystemRealpath = (path: string): string =>
	path.replace(SYSTEM_PRIVATE_PREFIX_RE, "");

const checkSymlinked = (resolvedPath: string): boolean => {
	const realResolved = realpathSync(resolvedPath);
	return (
		normalizeSystemRealpath(realResolved) !==
		normalizeSystemRealpath(resolvedPath)
	);
};

const formatThrownError = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
};

const assertWriteable = (
	action: () => void,
): { readonly ok: true } | { readonly ok: false; readonly message: string } => {
	try {
		action();
		return { ok: true };
	} catch (error) {
		return { ok: false, message: formatThrownError(error) };
	}
};

const prepareFreshDirectory = (
	resolvedPath: string,
	ledger: LedgerDirectory,
): void => {
	rmSync(resolvedPath, { recursive: true, force: true });
	mkdirSync(resolvedPath, { recursive: true });
	const instructionsDir = join(resolvedPath, "instructions");
	rmSync(instructionsDir, { recursive: true, force: true });
	mkdirSync(instructionsDir, { recursive: true });
	ledger.initialize();
	writeFileSync(join(resolvedPath, ".operational"), "ok\n", "utf-8");
};

const verifyExistingDirectory = (
	resolvedPath: string,
	_ledger: LedgerDirectory,
	ledgerPath: string,
): void => {
	writeFileSync(join(ledgerPath, ".operational"), "ok\n", "utf-8");
	writeFileSync(join(resolvedPath, ".operational"), "ok\n", "utf-8");
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

	static #codec(
		prepare: (
			resolvedPath: string,
			ledger: LedgerDirectory,
			ledgerPath: string,
		) => void,
	) {
		return CheckoutSchema.transform((rawPath, ctx) => {
			const resolvedPath = resolve(rawPath);
			const ledgerPath = join(dirname(resolvedPath), "ledger");
			const parsedLedger = LedgerDirectory.from(ledgerPath);
			if (!parsedLedger.success) {
				ctx.addIssue({
					code: "custom",
					message: `Workdir is not writeable: ${z.prettifyError(parsedLedger.error)}`,
				});
				return z.NEVER;
			}
			const writeCheck = assertWriteable(() =>
				prepare(resolvedPath, parsedLedger.data, ledgerPath),
			);
			if (!writeCheck.ok) {
				ctx.addIssue({
					code: "custom",
					message: `Workdir is not writeable: ${writeCheck.message}`,
				});
				return z.NEVER;
			}
			const parsedSnapshot = SnapshotDirectory.from(
				join(resolvedPath, "snapshot"),
			);
			if (!parsedSnapshot.success) {
				ctx.addIssue({
					code: "custom",
					message: z.prettifyError(parsedSnapshot.error),
				});
				return z.NEVER;
			}
			return new Workdir(
				resolvedPath,
				parsedLedger.data,
				parsedSnapshot.data,
				checkSymlinked(resolvedPath),
			);
		});
	}

	static readonly SCHEMA = Workdir.#codec(prepareFreshDirectory);
	static readonly EXISTING_SCHEMA = Workdir.#codec(verifyExistingDirectory);

	static from(raw: Checkout): z.ZodSafeParseResult<Workdir> {
		return Workdir.SCHEMA.safeDecode(raw);
	}

	static open(raw: Checkout): z.ZodSafeParseResult<Workdir> {
		return Workdir.EXISTING_SCHEMA.safeDecode(raw);
	}

	static fromSession(raw: string): z.ZodSafeParseResult<Workdir> {
		let decoded = raw;
		if (raw.startsWith(SESSION_PREFIX)) {
			decoded = Buffer.from(
				raw.slice(SESSION_PREFIX.length),
				"base64url",
			).toString("utf-8");
		}
		return Workdir.open(decoded);
	}

	sessionToken(): string {
		return `${SESSION_PREFIX}${Buffer.from(this.#path, "utf-8").toString("base64url")}`;
	}

	isSymlinked(): boolean {
		return this.#symlinked;
	}

	warning(): string | null {
		if (this.#symlinked) {
			return `Workdir path '${this.#path}' traverses a symlink; prefer a canonical non-symlinked directory.`;
		}
		return null;
	}

	ledgerDirectory(): LedgerDirectory {
		return this.#ledger;
	}

	snapshotDirectory(): SnapshotDirectory {
		return this.#snapshot;
	}

	writeAudit(name: string, document: AgentInstructions): void {
		const dir = join(this.#path, "instructions");
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

export type { PersistedAudit };
