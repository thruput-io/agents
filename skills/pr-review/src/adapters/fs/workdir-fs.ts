import {
	existsSync,
	mkdirSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { LedgerDirectory } from "./ledger-directory.ts";

const SYSTEM_PRIVATE_PREFIX_RE = /^\/private(?=\/(?:var|tmp)(?:\/|$))/u;
const OWNER_WRITE_BIT = 0o200;
const GROUP_WRITE_BIT = 0o020;
const OTHER_WRITE_BIT = 0o002;
const WRITE_BITS = [OWNER_WRITE_BIT, GROUP_WRITE_BIT, OTHER_WRITE_BIT] as const;

const isModeWritable = (mode: number): boolean =>
	WRITE_BITS.some((bit) => Math.floor(mode / bit) % 2 === 1);

const normalizeSystemRealpath = (path: string): string =>
	path.replace(SYSTEM_PRIVATE_PREFIX_RE, "");

const checkSymlinked = (resolvedPath: string): boolean => {
	const realResolved = realpathSync(resolvedPath);
	return (
		normalizeSystemRealpath(realResolved) !==
		normalizeSystemRealpath(resolvedPath)
	);
};

type WriteabilityCheck =
	| { readonly ok: true }
	| { readonly ok: false; readonly message: string };

const nearestExistingAncestor = (targetPath: string): string => {
	if (existsSync(targetPath)) {
		return targetPath;
	}
	const parent = dirname(targetPath);
	if (parent === targetPath) {
		return targetPath;
	}
	return nearestExistingAncestor(parent);
};

const checkTargetWriteable = (targetPath: string): WriteabilityCheck => {
	const ancestor = nearestExistingAncestor(targetPath);
	if (!existsSync(ancestor)) {
		return { ok: false, message: `Ancestor does not exist: ${ancestor}` };
	}
	const stats = statSync(ancestor);
	if (!stats.isDirectory()) {
		return { ok: false, message: `Path is not a directory: ${ancestor}` };
	}
	if (!isModeWritable(stats.mode)) {
		return { ok: false, message: `Directory is read-only: ${ancestor}` };
	}
	return { ok: true };
};

const checkFreshWriteable = (
	resolvedPath: string,
	ledgerPath: string,
): WriteabilityCheck => {
	const workspaceCheck = checkTargetWriteable(resolvedPath);
	if (!workspaceCheck.ok) {
		return workspaceCheck;
	}
	return checkTargetWriteable(ledgerPath);
};

const checkExistingWriteable = (
	resolvedPath: string,
	ledgerPath: string,
): WriteabilityCheck => {
	for (const dir of [resolvedPath, ledgerPath]) {
		if (!existsSync(dir)) {
			return { ok: false, message: `Directory does not exist: ${dir}` };
		}
		const stats = statSync(dir);
		if (!stats.isDirectory()) {
			return { ok: false, message: `Path is not a directory: ${dir}` };
		}
		if (!isModeWritable(stats.mode)) {
			return { ok: false, message: `Directory is read-only: ${dir}` };
		}
	}
	return { ok: true };
};

const prepareFreshDirectory = (
	resolvedPath: string,
	ledger: LedgerDirectory,
	ledgerPath: string,
): WriteabilityCheck => {
	const check = checkFreshWriteable(resolvedPath, ledgerPath);
	if (!check.ok) {
		return check;
	}
	rmSync(resolvedPath, { recursive: true, force: true });
	mkdirSync(resolvedPath, { recursive: true });
	const instructionsDir = join(resolvedPath, "instructions");
	rmSync(instructionsDir, { recursive: true, force: true });
	mkdirSync(instructionsDir, { recursive: true });
	ledger.initialize();
	writeFileSync(join(resolvedPath, ".operational"), "ok\n", "utf-8");
	return { ok: true };
};

const verifyExistingDirectory = (
	resolvedPath: string,
	_ledger: LedgerDirectory,
	ledgerPath: string,
): WriteabilityCheck => {
	const check = checkExistingWriteable(resolvedPath, ledgerPath);
	if (!check.ok) {
		return check;
	}
	writeFileSync(join(ledgerPath, ".operational"), "ok\n", "utf-8");
	writeFileSync(join(resolvedPath, ".operational"), "ok\n", "utf-8");
	return { ok: true };
};

export {
	checkSymlinked,
	prepareFreshDirectory,
	verifyExistingDirectory,
	type WriteabilityCheck,
};
