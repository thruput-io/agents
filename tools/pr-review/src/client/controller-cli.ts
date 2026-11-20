import { z } from "zod";
import {
	ControllerCommandSchema,
	type ReviewStatus,
} from "../domain/contracts.g.ts";
import type { WorkspaceFactoryPort } from "../domain/ports.ts";
import {
	failCli,
	optionalStringField,
	parseSchemaCli,
	type RawCommandResult,
	writeJson,
} from "./cli.ts";
import {
	handlePrepare,
	type MainAgentCliDriver,
} from "./controller-cli-handlers.ts";

const toRawControllerCommand = (args: readonly string[]): RawCommandResult => {
	const [command, firstArg, secondArg, thirdArg] = args;
	if (command === "prepare") {
		return {
			ok: true,
			raw: {
				command,
				url: firstArg,
				workdir: secondArg,
				...optionalStringField("token", thirdArg),
			},
		};
	}
	if (command === "status") {
		return { ok: true, raw: { command, workdir: firstArg } };
	}
	return { ok: true, raw: { command } };
};

async function runMainAgentCli(
	controller: MainAgentCliDriver,
	workspaceFactory: WorkspaceFactoryPort,
	args: readonly string[],
): Promise<number> {
	const dispatchedCli = parseSchemaCli(args, {
		schema: ControllerCommandSchema,
		help: () => ({
			usage: [
				"review-tool.mjs -h | --help",
				"review-tool.mjs prepare <url> <workdir> [<token>]",
				"review-tool.mjs status <workdir>",
			],
			commandSchema: z.toJSONSchema(ControllerCommandSchema, {
				target: "draft-2020-12",
			}),
		}),
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
	const ledger = controller.ledger(parsedWorkdir.data);
	const status: ReviewStatus = {
		pending: [...ledger.pending()],
		acknowledged: [...ledger.acknowledged()],
		unacknowledged: [...ledger.unacknowledged()],
		completed: [...ledger.completed()],
		submittedOutcome: ledger.submittedOutcome(),
		location: ledger.submittedLocation(),
	};
	writeJson(status);
	return 0;
}

export { runMainAgentCli };
