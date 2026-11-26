#!/usr/bin/env node
import process from "node:process";
import { Effect } from "effect";
import {
	notYetImplementedAgent,
	notYetImplementedHost,
	notYetImplementedStore,
} from "../../adapters/not-yet-implemented/not-yet-implemented.ts";
import { type Printed, run } from "../common/runner.ts";
import { subTool } from "./sub-commands.ts";

const printed: Printed = await Effect.runPromise(
	run(
		subTool(
			notYetImplementedHost,
			notYetImplementedStore,
			notYetImplementedAgent,
		),
		process.argv.slice(2),
	),
);

process.stdout.write(printed.line, (): never => process.exit(printed.exitCode));
