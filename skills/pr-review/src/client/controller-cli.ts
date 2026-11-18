#!/usr/bin/env node
import { z } from "zod";
import { MainAgentController } from "../controller/controller.ts";
import { AccessToken } from "../domain/access-token.ts";
import {
	ControllerCommandSchema,
	type DispatchResult,
	type PrepareResponse,
	type ReviewStatus,
} from "../domain/contracts.g.ts";
import { isNullOrEmpty } from "../domain/nullish.ts";
import type { AdapterResolution } from "../io/host-adapter.ts";
import type { MainAgentLedger } from "../io/main-agent-ledger.ts";
import { Workdir } from "../io/workdir.ts";
import {
	failCli,
	failWithJson,
	isCliEntrypoint,
	optionalStringField,
	parseSchemaCli,
	type RawCommandResult,
	writeJson,
} from "./cli.ts";

interface MainAgentCliDriver {
	prepare: (
		target: string,
		workdir: Workdir,
	) => Promise<
		| { readonly success: true; readonly data: AdapterResolution }
		| {
				readonly success: false;
				readonly error: Extract<
					PrepareResponse,
					{ readonly success: false }
				>["error"];
		  }
	>;
	prepareWithToken: (
		target: string,
		workdir: Workdir,
		token: AccessToken,
	) => Promise<
		| { readonly success: true; readonly data: AdapterResolution }
		| {
				readonly success: false;
				readonly error: Extract<
					PrepareResponse,
					{ readonly success: false }
				>["error"];
		  }
	>;
	ledger: (workdir: Workdir) => MainAgentLedger;
	dispatch: (workdir: Workdir) => Promise<DispatchResult>;
	dispatchWithToken: (
		workdir: Workdir,
		token: AccessToken,
	) => Promise<DispatchResult>;
}

const writePrepared = (workdir: Workdir, ledger: MainAgentLedger): number => {
	const warning = workdir.warning();
	const session = workdir.sessionToken();
	const pending = ledger.pending();
	const permissions = Object.fromEntries(
		pending.map((name) => [name, ledger.permissions(name)]),
	);
	const baseResponse = {
		success: true as const,
		session,
		pending: [...pending],
		permissions,
	};
	if (isNullOrEmpty(warning)) {
		writeJson(baseResponse);
		return 0;
	}
	const response: PrepareResponse = { ...baseResponse, warning };
	writeJson(response);
	return 0;
};

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
	if (command === "dispatch") {
		return {
			ok: true,
			raw: {
				command,
				workdir: firstArg,
				...optionalStringField("token", secondArg),
			},
		};
	}
	return { ok: true, raw: { command } };
};

const handlePrepare = async (
	controller: MainAgentCliDriver,
	cmd: {
		readonly url: string;
		readonly workdir: string;
		readonly token?: string | undefined;
	},
): Promise<number> => {
	const parsedWorkdir = Workdir.from(cmd.workdir);
	if (!parsedWorkdir.success) {
		return failWithJson({
			success: false,
			error: {
				kind: "invalid-workdir",
				message: z.prettifyError(parsedWorkdir.error),
			},
		} satisfies PrepareResponse);
	}
	if (isNullOrEmpty(cmd.token)) {
		const result = await controller.prepare(cmd.url, parsedWorkdir.data);
		if (!result.success) {
			writeJson(result satisfies PrepareResponse);
			return 0;
		}
		return writePrepared(
			parsedWorkdir.data,
			controller.ledger(parsedWorkdir.data),
		);
	}
	const parsedToken = AccessToken.from(cmd.token);
	if (!parsedToken.success) {
		return failWithJson({
			success: false,
			error: {
				kind: "invalid-token",
				message: z.prettifyError(parsedToken.error),
			},
		} satisfies PrepareResponse);
	}
	const result = await controller.prepareWithToken(
		cmd.url,
		parsedWorkdir.data,
		parsedToken.data,
	);
	if (!result.success) {
		writeJson(result satisfies PrepareResponse);
		return 0;
	}
	return writePrepared(
		parsedWorkdir.data,
		controller.ledger(parsedWorkdir.data),
	);
};

const handleDispatch = async (
	controller: MainAgentCliDriver,
	workdir: Workdir,
	token: string | undefined,
): Promise<number> => {
	if (isNullOrEmpty(token)) {
		writeJson(await controller.dispatch(workdir));
		return 0;
	}
	const parsedToken = AccessToken.from(token);
	if (!parsedToken.success) {
		return failCli(`${z.prettifyError(parsedToken.error)}\n`);
	}
	writeJson(await controller.dispatchWithToken(workdir, parsedToken.data));
	return 0;
};

async function runMainAgentCli(
	controller: MainAgentCliDriver,
	args: readonly string[],
): Promise<number> {
	const dispatchedCli = parseSchemaCli(args, {
		schema: ControllerCommandSchema,
		help: () => ({
			usage: [
				"review-tool -h | --help",
				"review-tool prepare <url> <workdir> [<token>]",
				"review-tool status <workdir>",
				"review-tool dispatch <workdir> [<token>]",
			],
		}),
		toRaw: toRawControllerCommand,
		onInvalidCommand: (_command, details) => failCli(`${details}\n`),
	});
	if (dispatchedCli.kind === "done") {
		return dispatchedCli.exitCode;
	}
	const cmd = dispatchedCli.command;
	if (cmd.command === "prepare") {
		return await handlePrepare(controller, cmd);
	}
	const parsedWorkdir = Workdir.open(cmd.workdir);
	if (!parsedWorkdir.success) {
		return failCli(`${z.prettifyError(parsedWorkdir.error)}\n`);
	}
	if (cmd.command === "status") {
		const ledger = controller.ledger(parsedWorkdir.data);
		const status: ReviewStatus = {
			pending: [...ledger.pending()],
			acknowledged: [...ledger.acknowledged()],
			unacknowledged: [...ledger.unacknowledged()],
			completed: [...ledger.completed()],
			submittedOutcome: ledger.submittedOutcome(),
		};
		writeJson(status);
		return 0;
	}
	return await handleDispatch(controller, parsedWorkdir.data, cmd.token);
}

if (import.meta.main || isCliEntrypoint(import.meta.url)) {
	await runMainAgentCli(MainAgentController.default(), process.argv.slice(2));
}

export type { MainAgentCliDriver };
export { runMainAgentCli };
