import { z } from "zod";
import { isNullOrEmpty } from "../domain/nullish.ts";

export type SchemaCliDispatch<Command> =
	| { readonly kind: "done"; readonly exitCode: number }
	| { readonly kind: "command"; readonly command: Command };

export interface SchemaCliConfig<Command> {
	readonly schema: z.ZodType<Command>;
	readonly toRaw: (args: readonly string[], ctx: z.RefinementCtx) => unknown;
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
	return 1;
};

export const exitWithCode = (exitCode: number): void => {
	if (exitCode === 0) {
		return;
	}
	process.stdout.write("", () => {
		process.stderr.write("", () => {
			process.exit(exitCode);
		});
	});
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
		writeJson(z.toJSONSchema(config.schema, { target: "draft-2020-12" }));
		return { kind: "done", exitCode: 0 };
	}
	if (isNullOrEmpty(command) && !isNullOrEmpty(config.missingCommandUsage)) {
		return { kind: "done", exitCode: failCli(config.missingCommandUsage) };
	}
	const argsPipeline = z
		.array(z.string())
		.readonly()
		.transform(config.toRaw)
		.pipe(config.schema);
	const parsed = argsPipeline.safeParse(args);
	if (!parsed.success) {
		const details = z.prettifyError(parsed.error);
		return {
			kind: "done",
			exitCode: config.onInvalidCommand(command, details),
		};
	}
	return { kind: "command", command: parsed.data };
}
