import { z } from "zod";
import { ControllerCommandSchema } from "../domain/contracts.g.ts";
import type { WorkspaceFactoryPort } from "../domain/ports.ts";
import {
	failCli,
	optionalStringField,
	parseSchemaCli,
	writeJson,
} from "./cli.ts";
import {
	handlePrepare,
	type MainAgentCliDriver,
} from "./controller-cli-handlers.ts";

const toRawControllerCommand = (args: readonly string[]): unknown => {
	const [command, firstArg, secondArg, thirdArg] = args;
	if (command === "prepare") {
		return {
			command,
			url: firstArg,
			workdir: secondArg,
			...optionalStringField("token", thirdArg),
		};
	}
	if (command === "status") {
		return { command, workdir: firstArg };
	}
	return { command };
};

async function runMainAgentCli(
	controller: MainAgentCliDriver,
	workspaceFactory: WorkspaceFactoryPort,
	args: readonly string[],
): Promise<number> {
	const dispatchedCli = parseSchemaCli(args, {
		schema: ControllerCommandSchema,
		toRaw: toRawControllerCommand,
		onInvalidCommand: (_command, details) => failCli(`${details}\n`),
	});
	if (dispatchedCli.kind === "done") {
		return dispatchedCli.exitCode;
	}
	const cmd = dispatchedCli.command;
	if (cmd.command === "prepare") {
		return await handlePrepare(controller, workspaceFactory, cmd);
	}
	const parsedWorkdir = workspaceFactory.open(cmd.workdir);
	if (!parsedWorkdir.success) {
		return failCli(`${z.prettifyError(parsedWorkdir.error)}\n`);
	}
	writeJson(await controller.status(parsedWorkdir.data));
	return 0;
}

export { runMainAgentCli };
