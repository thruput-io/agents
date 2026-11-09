import { z } from "zod";
import { AccessToken } from "./access-token.ts";
import type { AdapterResolution } from "./adapter.ts";
import type { Ledger, Outcome } from "./contracts.g.ts";
import type { MainAgentLedger } from "./main-agent-ledger.ts";
import { isNullOrEmpty } from "./nullish.ts";
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

export async function runMainAgentCli(
	controller: MainAgentCliDriver,
	args: readonly string[],
): Promise<void> {
	const [command, firstArg, secondArg, thirdArg] = args;
	if (command === "prepare") {
		if (isNullOrEmpty(firstArg) || isNullOrEmpty(secondArg)) {
			process.stderr.write(
				"Usage: node controller.ts prepare <url> <workdir> [<token>]\n",
			);
			process.exitCode = 1;
			return;
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
			process.exitCode = 1;
			return;
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
				process.exitCode = 1;
				return;
			}
			const result = await controller.prepareWithToken(
				firstArg,
				parsedWorkdir.data,
				parsedToken.data,
			);
			if (!result.success) {
				writeJson(result);
				return;
			}
			writeJson({
				success: true,
				headCommit: result.data.headCommit,
				change: result.data.change,
				pending: controller.ledger(parsedWorkdir.data).pending(),
			});
			return;
		}
		const result = await controller.prepare(firstArg, parsedWorkdir.data);
		if (!result.success) {
			writeJson(result);
			return;
		}
		writeJson({
			success: true,
			headCommit: result.data.headCommit,
			change: result.data.change,
			pending: controller.ledger(parsedWorkdir.data).pending(),
		});
		return;
	}
	if (command === "dispatch" || command === "status") {
		if (isNullOrEmpty(firstArg)) {
			process.stderr.write(
				"Usage: node controller.ts <dispatch|status> <workdir> [<token>]\n",
			);
			process.exitCode = 1;
			return;
		}
		const parsedWorkdir = Workdir.from(firstArg);
		if (!parsedWorkdir.success) {
			writeJson({
				success: false,
				error: z.prettifyError(parsedWorkdir.error),
			});
			process.exitCode = 1;
			return;
		}
		if (command === "status") {
			const ledger = controller.ledger(parsedWorkdir.data);
			writeJson({
				pending: ledger.pending(),
				completed: ledger.completed(),
				submittedOutcome: ledger.submittedOutcome(),
			});
			return;
		}
		if (!isNullOrEmpty(secondArg)) {
			const parsedToken = AccessToken.from(secondArg);
			if (!parsedToken.success) {
				writeJson({
					success: false,
					error: z.prettifyError(parsedToken.error),
				});
				process.exitCode = 1;
				return;
			}
			const dispatched = await controller.dispatchWithToken(
				parsedWorkdir.data,
				parsedToken.data,
			);
			writeJson(dispatched);
			return;
		}
		const dispatched = await controller.dispatch(parsedWorkdir.data);
		writeJson(dispatched);
		return;
	}
	process.stderr.write(
		"Usage: node controller.ts <prepare|dispatch|status> ...\n",
	);
	process.exitCode = 1;
}
