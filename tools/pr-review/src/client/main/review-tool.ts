#!/usr/bin/env node
import { Effect } from "effect";
import { z } from "zod";
import { gitHost } from "../../adapters/git/git-host.ts";
import { memoryStore } from "../../adapters/persistence/memory/memory-store.ts";
import { MainController } from "../../controller/main/main-controller.ts";
import { probesFrom } from "../../domain/factory.ts";
import {
	ReviewStatusCodec,
	TargetUrlCodec,
	WorkdirCodec,
} from "../../perimeters/codec.ts";
import { idleAgent } from "./idle-agent.ts";

const PrepareArguments = z.tuple([
	z.literal("prepare"),
	TargetUrlCodec,
	WorkdirCodec,
]);

const [, url, workdir] = PrepareArguments.parse(process.argv.slice(2));
const controller = MainController.over(gitHost, memoryStore, idleAgent);
const status = await Effect.runPromise(
	controller.prepare(url, workdir, probesFrom()),
);

process.stdout.write(`${JSON.stringify(ReviewStatusCodec.encode(status))}\n`);
