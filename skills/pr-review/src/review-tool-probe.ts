#!/usr/bin/env node
import { resolveDefinition } from "./adapters/fs/define.ts";
import { WorkdirFactory } from "./adapters/fs/workdir.ts";
import { exitWithCode, isCliEntrypoint } from "./client/cli.ts";
import { runSubAgentCli } from "./client/sub-agent-cli.ts";
import { SubAgentController } from "./controller/sub-agent-controller.ts";

if (import.meta.main || isCliEntrypoint(import.meta.url)) {
	const exitCode = runSubAgentCli(
		{
			workspaceFactory: WorkdirFactory,
			forSession: (session, name) =>
				SubAgentController.forSession(WorkdirFactory, session, name),
			resolveDefinition,
		},
		process.argv.slice(2),
	);
	exitWithCode(exitCode);
}
