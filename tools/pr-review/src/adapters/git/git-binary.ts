import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Git } from "./git-host.ts";

const run = promisify(execFile);

const gitBinary: Git = async (
	gitArguments: readonly string[],
): Promise<string> => {
	const { stdout } = await run("git", [...gitArguments]);

	return stdout;
};

export { gitBinary };
