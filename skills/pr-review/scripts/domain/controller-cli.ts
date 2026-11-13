import { z } from "zod";
import { AccessToken } from "./access-token.ts";
import type { AdapterResolution } from "./adapter.ts";
import {
	ControllerCommandSchema,
	type DispatchResult,
	type PrepareResponse,
	type ReviewStatus,
} from "./contracts.g.ts";
import type { MainAgentLedger } from "./main-agent-ledger.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { bootstrapPrompt, subAgentHelpPayload } from "./sub-agent-cli.ts";
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

const writeJson = (payload: object): void => {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const failCli = (message?: string): number => {
	if (!isNullOrEmpty(message)) {
		process.stderr.write(message);
	}
	process.exitCode = 1;
	return 1;
};

const writePrepared = (workdir: Workdir, ledger: MainAgentLedger): number => {
	const warning = workdir.warning();
	const session = workdir.sessionToken();
	const pending = ledger.pending();
	const prompts = Object.fromEntries(
		pending.map((name) => [name, bootstrapPrompt(session, name)]),
	);
	const permissions = Object.fromEntries(
		pending.map((name) => [name, ledger.permissions(name)]),
	);
	const response: PrepareResponse = isNullOrEmpty(warning)
		? { success: true, session, pending: [...pending], prompts, permissions }
		: {
				success: true,
				session,
				pending: [...pending],
				prompts,
				permissions,
				warning,
			};
	writeJson(response);
	return 0;
};

const toRawControllerCommand = (args: readonly string[]): unknown => {
	const [command, firstArg, secondArg, thirdArg] = args;
	if (command === "prepare") {
		return {
			command,
			url: firstArg,
			workdir: secondArg,
			...(isNullOrEmpty(thirdArg) ? {} : { token: thirdArg }),
		};
	}
	if (command === "status") {
		return { command, workdir: firstArg };
	}
	if (command === "dispatch") {
		return {
			command,
			workdir: firstArg,
			...(isNullOrEmpty(secondArg) ? {} : { token: secondArg }),
		};
	}
	return { command };
};

export async function runMainAgentCli(
	controller: MainAgentCliDriver,
	args: readonly string[],
): Promise<number> {
	const [command] = args;
	if (command === "-h" || command === "--help") {
		writeJson({
			usage: [
				"node controller.ts -h | --help",
				"node controller.ts prepare <url> <workdir> [<token>]",
				"node controller.ts status <workdir>",
				"node controller.ts dispatch <workdir> [<token>]",
			],
			subAgentController: subAgentHelpPayload(),
		});
		return 0;
	}
	const parsedCommand = ControllerCommandSchema.safeParse(
		toRawControllerCommand(args),
	);
	if (!parsedCommand.success) {
		return failCli(`${z.prettifyError(parsedCommand.error)}\n`);
	}
	const cmd = parsedCommand.data;
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
			writeJson(response);
			return failCli();
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
				writeJson(response);
				return failCli();
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
	const parsedWorkdir = Workdir.from(cmd.workdir);
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
