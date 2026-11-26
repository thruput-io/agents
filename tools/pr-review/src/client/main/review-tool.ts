#!/usr/bin/env node
import process from "node:process";
import { Effect } from "effect";
import { gitBinary } from "../../adapters/git/git-binary.ts";
import { gitHostOver } from "../../adapters/git/git-host.ts";
import {
	notYetImplementedAgent,
	notYetImplementedHost,
	notYetImplementedStore,
} from "../../adapters/not-yet-implemented/not-yet-implemented.ts";
import { memoryStore } from "../../adapters/persistence/memory/memory-store.ts";
import { type Printed, run } from "../common/runner.ts";
import { mainTool } from "./main-commands.ts";

const printed: Printed = await Effect.runPromise(
	run(
		mainTool(
			{ ...notYetImplementedHost, ...gitHostOver(gitBinary) },
			{ ...notYetImplementedStore, ...memoryStore() },
			notYetImplementedAgent,
		),
		process.argv.slice(2),
	),
);

process.stdout.write(printed.line, (): never => process.exit(printed.exitCode));
