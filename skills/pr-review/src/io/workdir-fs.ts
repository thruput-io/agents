import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LedgerDirectory } from "./ledger-directory.ts";

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

export {
	assertWriteable,
	checkSymlinked,
	prepareFreshDirectory,
	verifyExistingDirectory,
};
