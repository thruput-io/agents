import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import type { AgentInstructions, PrepareReady } from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import { mockBridgeUrl, scenarioToken } from "./mock-server.ts";

type PreparedCliSuccess = PrepareReady;
type InspectedProbePayload = AgentInstructions;

const SKILL_DIR = fileURLToPath(new URL("../..", import.meta.url));
const PRELOAD_PATH = fileURLToPath(
	new URL("./msw-child-preload.ts", import.meta.url),
);
const NODE_OPTIONS_KEY = "NODE_OPTIONS";
const BRIDGE_URL_KEY = "PR_REVIEW_MOCK_BRIDGE_URL";
const GH_TOKEN_KEY = "GH_TOKEN";
const AZ_PAT_KEY = "AZURE_DEVOPS_EXT_PAT";

let installedBinDir = "";
let installRootDir = "";

const fail = (message: string): never => {
	throw new Error(message);
};

const expectEqual = <T>(actual: T, expected: T, message: string): void => {
	const outcomes: Readonly<Record<string, () => void>> = {
		true: () => undefined,
		false: () =>
			fail(`${message} (expected ${String(expected)}, got ${String(actual)})`),
	};
	nonnull(outcomes[String(actual === expected)])();
};

function installReviewToolForTest(): void {
	installRootDir = mkdtempSync(join(tmpdir(), "pr-review-bin-"));
	const stageDir = join(installRootDir, "pkg");
	const prefixDir = join(installRootDir, "prefix");
	cpSync(SKILL_DIR, stageDir, {
		recursive: true,
		dereference: true,
		filter: (src) => !src.includes("node_modules"),
	});
	const tarball = execFileSync(
		"npm",
		["pack", stageDir, "--pack-destination", installRootDir],
		{ encoding: "utf8" },
	)
		.trim()
		.split("\n")
		.pop();
	execFileSync(
		"npm",
		[
			"install",
			"-g",
			"--prefix",
			prefixDir,
			join(installRootDir, nonnull(tarball)),
			"--no-audit",
			"--no-fund",
		],
		{ encoding: "utf8" },
	);
	installedBinDir = join(prefixDir, "bin");
}

function cleanupReviewToolForTest(): void {
	rmSync(installRootDir, { recursive: true, force: true });
}

const runCliProcess = async <T>(
	commandName: string,
	args: readonly string[],
	schema: z.ZodType<T>,
): Promise<{ readonly exitCode: number; readonly payload: T }> => {
	const child = spawn(join(installedBinDir, commandName), [...args], {
		env: {
			...env,
			[NODE_OPTIONS_KEY]: `--import ${PRELOAD_PATH}`,
			[BRIDGE_URL_KEY]: mockBridgeUrl(),
			[GH_TOKEN_KEY]: scenarioToken,
			[AZ_PAT_KEY]: scenarioToken,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];
	child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
	child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
	const exitCode = await new Promise<number>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve(nonnull(code)));
	});
	const stdoutText = Buffer.concat(stdoutChunks).toString("utf8");
	const stderrText = Buffer.concat(stderrChunks).toString("utf8");
	expectEqual(
		stdoutText.length > 0,
		true,
		`CLI exited ${exitCode} with empty stdout; stderr: ${stderrText}`,
	);
	return {
		exitCode,
		payload: schema.parse(JSON.parse(stdoutText)),
	};
};

const requireExitZero = <T>(result: {
	readonly exitCode: number;
	readonly payload: T;
}): T => {
	expectEqual(result.exitCode, 0, `CLI command exited with ${result.exitCode}`);
	return result.payload;
};

const invokeMainCli = <T>(
	args: readonly string[],
	schema: z.ZodType<T>,
): Promise<{ readonly exitCode: number; readonly payload: T }> =>
	runCliProcess("review-tool", args, schema);

const invokeSubCli = <T>(
	args: readonly string[],
	schema: z.ZodType<T>,
): Promise<{ readonly exitCode: number; readonly payload: T }> =>
	runCliProcess("review-tool-probe", args, schema);

export {
	cleanupReviewToolForTest,
	expectEqual,
	type InspectedProbePayload,
	installReviewToolForTest,
	invokeMainCli,
	invokeSubCli,
	type PreparedCliSuccess,
	requireExitZero,
};
