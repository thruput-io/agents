import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isNullOrEmpty } from "../domain/nullish.ts";

export const isCliEntrypoint = (metaUrl: string): boolean => {
	const [, entryArg] = process.argv;
	if (isNullOrEmpty(entryArg) || !existsSync(entryArg)) {
		return false;
	}
	return realpathSync(fileURLToPath(metaUrl)) === realpathSync(entryArg);
};

export type RawCommandResult =
	| { readonly ok: true; readonly raw: unknown }
	| { readonly ok: false; readonly error: string };

export type SchemaCliDispatch<Command> =
	| { readonly kind: "done"; readonly exitCode: number }
	| { readonly kind: "command"; readonly command: Command };

export interface SchemaCliConfig<Command> {
	readonly schema: z.ZodType<Command>;
	readonly help: () => object;
	readonly toRaw: (args: readonly string[]) => RawCommandResult;
	readonly onInvalidCommand: (
		command: string | undefined,
		details: string,
	) => number;
	readonly missingCommandUsage?: string;
}

export const writeJson = (payload: object): void => {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
};

export const failCli = (message?: string): number => {
	if (!isNullOrEmpty(message)) {
		process.stderr.write(message);
	}
	process.exitCode = 1;
	return 1;
};

export const failWithJson = (payload: object): number => {
	writeJson(payload);
	return failCli();
};

export const failWithJsonError = (error: string): number =>
	failWithJson({ success: false, error });

export const optionalStringField = <Key extends string>(
	key: Key,
	value: string | undefined,
): Partial<Record<Key, string>> => {
	if (isNullOrEmpty(value)) {
		return {};
	}
	return { [key]: value } as Partial<Record<Key, string>>;
};

export function parseSchemaCli<Command>(
	args: readonly string[],
	config: SchemaCliConfig<Command>,
): SchemaCliDispatch<Command> {
	const [command] = args;
	if (command === "-h" || command === "--help") {
		writeJson(config.help());
		return { kind: "done", exitCode: 0 };
	}
	if (isNullOrEmpty(command) && !isNullOrEmpty(config.missingCommandUsage)) {
		return { kind: "done", exitCode: failCli(config.missingCommandUsage) };
	}
	const built = config.toRaw(args);
	if (!built.ok) {
		return { kind: "done", exitCode: failWithJsonError(built.error) };
	}
	const parsed = config.schema.safeParse(built.raw);
	if (!parsed.success) {
		const details = z.prettifyError(parsed.error);
		return {
			kind: "done",
			exitCode: config.onInvalidCommand(command, details),
		};
	}
	return { kind: "command", command: parsed.data };
}
