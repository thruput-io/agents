import { isMap, parseDocument } from "yaml";
import { z } from "zod";
import { isNullOrEmpty, nonnull } from "../domain/nullish.ts";

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

const toJsonPayloadCommand = (
	command: "ack" | "report",
	field: "payload" | "report",
	args: readonly string[],
	ctx: z.RefinementCtx,
): unknown => {
	const [, session, probe, thirdArg] = args;
	if (isNullOrEmpty(thirdArg)) {
		return { command, session, probe };
	}
	const parsedJson = readJsonInput(thirdArg);
	if (!parsedJson.ok) {
		ctx.addIssue({
			code: "custom",
			message: `Malformed JSON for ${command}: ${parsedJson.error}`,
		});
		return z.NEVER;
	}
	return {
		command,
		session,
		probe,
		[field]: parsedJson.value,
	};
};

const toProbeSessionCommand = ([
	command,
	session,
	probe,
]: readonly string[]) => ({
	command,
	session,
	probe,
});

const COMMAND_BUILDERS: Readonly<
	Record<string, (args: readonly string[], ctx: z.RefinementCtx) => unknown>
> = {
	instructions: toProbeSessionCommand,
	ack: (args, ctx) => toJsonPayloadCommand("ack", "payload", args, ctx),

	define: ([, term, secondArg]) => ({
		command: "define",
		term,
		depth: parseIntegerArg(secondArg, 1),
	}),

	rules: ([, session, probe, url, fourthArg]) => {
		if (isNullOrEmpty(url)) {
			return { command: "rules", session, probe };
		}
		return {
			command: "rules",
			session,
			probe,
			url,
			page: parseIntegerArg(fourthArg, 1),
		};
	},

	next: toProbeSessionCommand,
	prev: toProbeSessionCommand,
	report: (args, ctx) => toJsonPayloadCommand("report", "report", args, ctx),
};

const toRawSubAgentCommand = (
	args: readonly string[],
	ctx: z.RefinementCtx,
): unknown => {
	const [command] = args;
	if (command === undefined) {
		return { command };
	}
	const builder = COMMAND_BUILDERS[command];
	if (builder !== undefined) {
		return builder(args, ctx);
	}
	return { command };
};

export { toRawSubAgentCommand };
