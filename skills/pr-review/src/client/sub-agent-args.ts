import { existsSync, readFileSync, statSync } from "node:fs";
import { isMap, parseDocument } from "yaml";
import { isNullOrEmpty, nonnull } from "../domain/nullish.ts";
import type { RawCommandResult } from "./cli.ts";

const ACK_FAILURE_GUIDE =
	'Provide valid JSON for ack: Rules/Reuse/DeadCode -> {"message":"<dispatcher message received>","rulesInOrder":[<rule ids from #/ruleset/rules in order>],"observationFormat":"<observation> breaks <principle>"}; Context -> {"message":"<dispatcher message received>","bookRuleRows":3,"observationFormat":"<observation> breaks <principle>"}.';

const readJsonInput = (
	arg: string,
):
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly error: string } => {
	let raw = arg;
	if (
		!arg.trimStart().startsWith("{") &&
		existsSync(arg) &&
		statSync(arg).isFile()
	) {
		raw = readFileSync(arg, "utf-8");
	}
	const doc = parseDocument(raw, { schema: "json", strict: true });
	if (doc.errors.length > 0) {
		return { ok: false, error: nonnull(doc.errors[0]).message };
	}
	if (!(isMap(doc.contents) && doc.contents.flow)) {
		return { ok: false, error: "Expected a JSON object" };
	}
	return { ok: true, value: doc.toJS() as unknown };
};

const parseIntegerArg = (
	raw: string | undefined,
	fallback: number,
): number | typeof raw => {
	if (isNullOrEmpty(raw)) {
		return fallback;
	}
	const parsed = Number(raw);
	if (Number.isInteger(parsed)) {
		return parsed;
	}
	return raw;
};

const toAckCommand = (
	session: string | undefined,
	probe: string | undefined,
	thirdArg: string | undefined,
): RawCommandResult => {
	if (isNullOrEmpty(thirdArg)) {
		return {
			ok: false,
			error: `Missing ack JSON payload. ${ACK_FAILURE_GUIDE}`,
		};
	}
	const parsedJson = readJsonInput(thirdArg);
	if (!parsedJson.ok) {
		return {
			ok: false,
			error: `Malformed JSON for ack: ${parsedJson.error}. ${ACK_FAILURE_GUIDE}`,
		};
	}
	return {
		ok: true,
		raw: { command: "ack", session, probe, payload: parsedJson.value },
	};
};

const toReportCommand = (
	session: string | undefined,
	probe: string | undefined,
	thirdArg: string | undefined,
): RawCommandResult => {
	if (isNullOrEmpty(thirdArg)) {
		return { ok: true, raw: { command: "report", session, probe } };
	}
	const parsedJson = readJsonInput(thirdArg);
	if (!parsedJson.ok) {
		return {
			ok: false,
			error: `Malformed JSON for report: ${parsedJson.error}`,
		};
	}
	return {
		ok: true,
		raw: { command: "report", session, probe, report: parsedJson.value },
	};
};

const toRawSubAgentCommand = (args: readonly string[]): RawCommandResult => {
	const [command, firstArg, secondArg, thirdArg, fourthArg] = args;
	if (command === "define") {
		return {
			ok: true,
			raw: {
				command,
				term: firstArg,
				depth: parseIntegerArg(secondArg, 1),
			},
		};
	}
	if (command === "inspect" || command === "next" || command === "prev") {
		return { ok: true, raw: { command, session: firstArg, probe: secondArg } };
	}
	if (command === "ruleset") {
		return {
			ok: true,
			raw: {
				command,
				session: firstArg,
				probe: secondArg,
				url: thirdArg,
				page: parseIntegerArg(fourthArg, 1),
			},
		};
	}
	if (command === "ack") {
		return toAckCommand(firstArg, secondArg, thirdArg);
	}
	if (command === "report") {
		return toReportCommand(firstArg, secondArg, thirdArg);
	}
	return { ok: true, raw: { command } };
};

export { ACK_FAILURE_GUIDE, toRawSubAgentCommand };
