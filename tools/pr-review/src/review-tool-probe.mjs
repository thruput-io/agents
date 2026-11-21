#!/usr/bin/env node
import { HostAdapterFactory } from "./adapters/adapter-factory.ts";
import { resolveDefinition } from "./adapters/fs/define.ts";
import { isCliEntrypoint } from "./adapters/fs/skill-dir.ts";
import { WorkdirFactory } from "./adapters/fs/workdir.ts";
import { exitWithCode } from "./client/cli.ts";
import { runSubAgentCli } from "./client/sub-agent-cli.ts";
import { SubAgentController } from "./controller/sub-agent-controller.ts";

if (import.meta.main || isCliEntrypoint(import.meta.url)) {
	const exitCode = await runSubAgentCli(
		{
			workspaceFactory: WorkdirFactory,
			forSession: (session, name) =>
				SubAgentController.forSession(WorkdirFactory, session, name),
			resolveDefinition,
			adapters: HostAdapterFactory,
		},
		process.argv.slice(2),
	);
	exitWithCode(exitCode);
}
