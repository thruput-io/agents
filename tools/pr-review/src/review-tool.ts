#!/usr/bin/env node
import { HostAdapterFactory } from "./adapters/adapter-factory.ts";
import { loadBundledProbes } from "./adapters/fs/probe-loader.ts";
import { WorkdirFactory } from "./adapters/fs/workdir.ts";
import { exitWithCode, isCliEntrypoint } from "./client/cli.ts";
import { runMainAgentCli } from "./client/controller-cli.ts";
import { MainAgentController } from "./controller/controller.ts";

if (import.meta.main || isCliEntrypoint(import.meta.url)) {
	const controller = MainAgentController.create(
		HostAdapterFactory,
		loadBundledProbes,
	);
	const exitCode = await runMainAgentCli(
		controller,
		WorkdirFactory,
		process.argv.slice(2),
	);
	exitWithCode(exitCode);
}
