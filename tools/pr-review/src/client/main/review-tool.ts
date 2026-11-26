#!/usr/bin/env node
import process from "node:process";
import { Effect } from "effect";
import { gitHost } from "../../adapters/git/git-host.ts";
import { memoryStore } from "../../adapters/persistence/memory/memory-store.ts";
import { MainController } from "../../controller/main/main-controller.ts";
import { type Printed, run } from "../common/runner.ts";
import { idleAgent } from "./idle-agent.ts";
import { mainCommands } from "./main-commands.ts";

const controller: MainController = MainController.over(
	gitHost,
	memoryStore,
	idleAgent,
);
const printed: Printed = await Effect.runPromise(
	run(mainCommands(controller), process.argv.slice(2)),
);

process.stdout.write(printed.line);
process.exitCode = printed.exitCode;
