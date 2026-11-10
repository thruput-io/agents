import { z } from "zod";
import { AccessToken } from "./access-token.ts";
import type { AdapterResolution } from "./adapter.ts";
import type { Ledger, Outcome } from "./contracts.g.ts";
import type { MainAgentLedger } from "./main-agent-ledger.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { subAgentHelpPayload } from "./sub-agent-cli.ts";
import { Workdir } from "./workdir.ts";

type ReadyReview = Extract<AdapterResolution, { readonly kind: "ready" }>;

type PrepareError =
	| { readonly kind: "invalid-target"; readonly error: z.ZodError }
	| Exclude<AdapterResolution, { readonly kind: "ready" }>;

type PrepareResult =
	| { readonly success: true; readonly data: ReadyReview }
	| { readonly success: false; readonly error: PrepareError };

type DispatchResult =
	| { readonly kind: "pending"; readonly remaining: readonly string[] }
	| {
			readonly kind: "submitted";
			readonly outcome: Outcome;
			readonly ledger: Ledger;
			readonly location: string;
	  };

export interface MainAgentCliDriver {
	prepare: (url: string, workdir: Workdir) => Promise<PrepareResult>;
	prepareWithToken: (
		url: string,
		workdir: Workdir,
		token: AccessToken,
	) => Promise<PrepareResult>;
	ledger: (workdir: Workdir) => MainAgentLedger;
	dispatch: (workdir: Workdir) => Promise<DispatchResult>;
	dispatchWithToken: (
		workdir: Workdir,
		token: AccessToken,
	) => Promise<DispatchResult>;
}

const writeJson = (payload: object): void => {
	process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const failCli = (message?: string): number => {
	if (!isNullOrEmpty(message)) {
		process.stderr.write(message);
	}
	process.exitCode = 1;
	return 1;
};

const writePrepared = (
	workdir: Workdir,
	result: ReadyReview,
	pending: readonly string[],
): number => {
	const warning = workdir.warning();
	writeJson({
		success: true,
		session: workdir.sessionToken(),
		headCommit: result.headCommit,
		change: result.change,
		pending,
		...(isNullOrEmpty(warning) ? {} : { warning }),
	});
	return 0;
};

export async function runMainAgentCli(
	controller: MainAgentCliDriver,
	args: readonly string[],
): Promise<number> {
	const [command, firstArg, secondArg, thirdArg] = args;
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
	if (command === "prepare") {
		if (isNullOrEmpty(firstArg) || isNullOrEmpty(secondArg)) {
			return failCli(
				"Usage: node controller.ts prepare <url> <workdir> [<token>]\n",
			);
		}
		const parsedWorkdir = Workdir.from(secondArg);
		if (!parsedWorkdir.success) {
			writeJson({
				success: false,
				error: {
					kind: "invalid-workdir",
					message: z.prettifyError(parsedWorkdir.error),
				},
			});
			return failCli();
		}
		if (!isNullOrEmpty(thirdArg)) {
			const parsedToken = AccessToken.from(thirdArg);
			if (!parsedToken.success) {
				writeJson({
					success: false,
					error: {
						kind: "invalid-token",
						message: z.prettifyError(parsedToken.error),
					},
				});
				return failCli();
			}
			const result = await controller.prepareWithToken(
				firstArg,
				parsedWorkdir.data,
				parsedToken.data,
			);
			if (!result.success) {
				writeJson(result);
				return 0;
			}
			return writePrepared(
				parsedWorkdir.data,
				result.data,
				controller.ledger(parsedWorkdir.data).pending(),
			);
		}
		const result = await controller.prepare(firstArg, parsedWorkdir.data);
		if (!result.success) {
			writeJson(result);
			return 0;
		}
		return writePrepared(
			parsedWorkdir.data,
			result.data,
			controller.ledger(parsedWorkdir.data).pending(),
		);
	}
	if (command === "dispatch" || command === "status") {
		if (isNullOrEmpty(firstArg)) {
			return failCli(
				"Usage: node controller.ts <dispatch|status> <workdir> [<token>]\n",
			);
		}
		const parsedWorkdir = Workdir.from(firstArg);
		if (!parsedWorkdir.success) {
			writeJson({
				success: false,
				error: z.prettifyError(parsedWorkdir.error),
			});
			return failCli();
		}
		if (command === "status") {
			const ledger = controller.ledger(parsedWorkdir.data);
			writeJson({
				pending: ledger.pending(),
				completed: ledger.completed(),
				submittedOutcome: ledger.submittedOutcome(),
			});
			return 0;
		}
		if (!isNullOrEmpty(secondArg)) {
			const parsedToken = AccessToken.from(secondArg);
			if (!parsedToken.success) {
				writeJson({
					success: false,
					error: z.prettifyError(parsedToken.error),
				});
				return failCli();
			}
			const dispatched = await controller.dispatchWithToken(
				parsedWorkdir.data,
				parsedToken.data,
			);
			writeJson(dispatched);
			return 0;
		}
		const dispatched = await controller.dispatch(parsedWorkdir.data);
		writeJson(dispatched);
		return 0;
	}
	return failCli("Usage: node controller.ts <prepare|dispatch|status> ...\n");
}
