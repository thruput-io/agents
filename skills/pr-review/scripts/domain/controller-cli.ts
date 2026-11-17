#!/usr/bin/env node
import { z } from "zod";
import { AccessToken } from "./access-token.ts";
import type { AdapterResolution } from "./adapter.ts";
import {
	failCli,
	failWithJson,
	isCliEntrypoint,
	optionalStringField,
	parseSchemaCli,
	type RawCommandResult,
	writeJson,
} from "./cli.ts";
import {
	ControllerCommandSchema,
	type DispatchResult,
	type PrepareResponse,
	type ReviewStatus,
} from "./contracts.g.ts";
import { MainAgentController } from "./controller.ts";
import type { MainAgentLedger } from "./main-agent-ledger.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { Workdir } from "./workdir.ts";

export interface MainAgentCliDriver {
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
	const response: PrepareResponse = isNullOrEmpty(warning)
		? { success: true, session, pending: [...pending], permissions }
		: {
				success: true,
				session,
				pending: [...pending],
				permissions,
				warning,
			};
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

export async function runMainAgentCli(
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
		const parsedWorkdir = Workdir.from(cmd.workdir);
		if (!parsedWorkdir.success) {
			const response: PrepareResponse = {
				success: false,
				error: {
					kind: "invalid-workdir",
					message: z.prettifyError(parsedWorkdir.error),
				},
			};
			return failWithJson(response);
		}
		if (!isNullOrEmpty(cmd.token)) {
			const parsedToken = AccessToken.from(cmd.token);
			if (!parsedToken.success) {
				const response: PrepareResponse = {
					success: false,
					error: {
						kind: "invalid-token",
						message: z.prettifyError(parsedToken.error),
					},
				};
				return failWithJson(response);
			}
			const result = await controller.prepareWithToken(
				cmd.url,
				parsedWorkdir.data,
				parsedToken.data,
			);
			if (!result.success) {
				const response: PrepareResponse = result;
				writeJson(response);
				return 0;
			}
			return writePrepared(
				parsedWorkdir.data,
				controller.ledger(parsedWorkdir.data),
			);
		}
		const result = await controller.prepare(cmd.url, parsedWorkdir.data);
		if (!result.success) {
			const response: PrepareResponse = result;
			writeJson(response);
			return 0;
		}
		return writePrepared(
			parsedWorkdir.data,
			controller.ledger(parsedWorkdir.data),
		);
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
	if (!isNullOrEmpty(cmd.token)) {
		const parsedToken = AccessToken.from(cmd.token);
		if (!parsedToken.success) {
			return failCli(`${z.prettifyError(parsedToken.error)}\n`);
		}
		const dispatched: DispatchResult = await controller.dispatchWithToken(
			parsedWorkdir.data,
			parsedToken.data,
		);
		writeJson(dispatched);
		return 0;
	}
	const dispatched: DispatchResult = await controller.dispatch(
		parsedWorkdir.data,
	);
	writeJson(dispatched);
	return 0;
}

if (import.meta.main || isCliEntrypoint(import.meta.url)) {
	await runMainAgentCli(MainAgentController.create(), process.argv.slice(2));
}
