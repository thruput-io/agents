#!/usr/bin/env node
import process from "node:process";
import { Effect } from "effect";
import { gitHost } from "../../adapters/git/git-host.ts";
import { memoryStore } from "../../adapters/persistence/memory/memory-store.ts";
import { MainController } from "../../controller/main/main-controller.ts";
import {
	prepareCommandOf,
	statusLineOf,
} from "../../perimeters/command-line.ts";
import { idleAgent } from "./idle-agent.ts";

const controller = MainController.over(gitHost, memoryStore, idleAgent);
const answered = prepareCommandOf(process.argv.slice(2)).pipe(
	Effect.flatMap(({ url, workdir, probes }) =>
		controller.prepare(url, workdir, probes),
	),
	Effect.map(statusLineOf),
);

process.stdout.write(await Effect.runPromise(answered));
