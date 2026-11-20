import { z } from "zod";
import { AccessToken } from "../domain/access-token.ts";
import type { DispatchResult, PrepareResponse } from "../domain/contracts.g.ts";
import type { AdapterResolution } from "../domain/host-adapter.ts";
import type { MainAgentLedger } from "../domain/main-agent-ledger.ts";
import { isNullOrEmpty } from "../domain/nullish.ts";
import type { WorkspaceFactoryPort, WorkspacePort } from "../domain/ports.ts";
import { failCli, failWithJson, writeJson } from "./cli.ts";

interface MainAgentCliDriver {
	prepare: (
		target: string,
		workdir: WorkspacePort,
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
		workdir: WorkspacePort,
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
	ledger: (workdir: WorkspacePort) => MainAgentLedger;
	dispatch: (workdir: WorkspacePort) => Promise<DispatchResult>;
	dispatchWithToken: (
		workdir: WorkspacePort,
		token: AccessToken,
	) => Promise<DispatchResult>;
}

const writePrepared = (
	workdir: WorkspacePort,
	ledger: MainAgentLedger,
): number => {
	const warning = workdir.warning();
	const session = workdir.sessionToken();
	const pending = ledger.pending();
	const prompts = Object.fromEntries(
		pending.map((name) => [name, ledger.prompt(name)]),
	);
	const permissions = Object.fromEntries(
		pending.map((name) => [name, ledger.permissions(name)]),
	);
	const baseResponse = {
		success: true as const,
		session,
		pending: [...pending],
		prompts,
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

const handlePrepare = async (
	controller: MainAgentCliDriver,
	workspaceFactory: WorkspaceFactoryPort,
	cmd: {
		readonly url: string;
		readonly workdir: string;
		readonly token?: string | undefined;
	},
): Promise<number> => {
	const parsedWorkdir = workspaceFactory.from(cmd.workdir);
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
	workdir: WorkspacePort,
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

export type { MainAgentCliDriver };
export { handleDispatch, handlePrepare };
