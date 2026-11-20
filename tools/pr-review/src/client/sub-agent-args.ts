import { isMap, parseDocument } from "yaml";
import { isNullOrEmpty, nonnull } from "../domain/nullish.ts";
import type { RawCommandResult } from "./cli.ts";

const readJsonInput = (
	raw: string,
):
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly error: string } => {
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
	if (command === "ack" || command === "next" || command === "prev") {
		return { ok: true, raw: { command, session: firstArg, probe: secondArg } };
	}
	if (command === "rules") {
		return {
			ok: true,
			raw: {
				command,
				session: firstArg,
				probe: secondArg,
				page: parseIntegerArg(thirdArg, 1),
			},
		};
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
	if (command === "report") {
		return toReportCommand(firstArg, secondArg, thirdArg);
	}
	return { ok: true, raw: { command } };
};

export { toRawSubAgentCommand };
