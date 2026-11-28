#!/usr/bin/env node
import process from "node:process";
import { Effect } from "effect";
import { gitBinary } from "../../adapters/git/git-binary.ts";
import { gitHostOver } from "../../adapters/git/git-host.ts";
import {
	notYetImplementedAgent,
	notYetImplementedHost,
} from "../../adapters/not-yet-implemented/not-yet-implemented.ts";
import { diskFiles } from "../../adapters/persistence/disk/disk-files.ts";
import { diskStoreOver } from "../../adapters/persistence/disk/disk-store.ts";
import { type Printed, run } from "../common/runner.ts";
import { mainTool } from "./main-commands.ts";

const printed: Printed = await Effect.runPromise(
	run(
		mainTool(
			{ ...notYetImplementedHost, ...gitHostOver(gitBinary) },
			diskStoreOver(diskFiles),
			notYetImplementedAgent,
		),
		process.argv.slice(2),
	),
);

process.stdout.write(printed.line, (): never => process.exit(printed.exitCode));
