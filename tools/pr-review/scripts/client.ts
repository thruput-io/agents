import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generate } from "orval";
import { z } from "zod";

const text = z.string().min(1);

const OperationShape = z.object({
	operationId: text,
	description: text,
	parameters: z.array(z.object({ name: text })),
});

const ClientShape = z.object({
	info: z.object({ description: text }),
	paths: z.record(text, z.record(text, OperationShape)),
});

type Operation = z.infer<typeof OperationShape>;
type Client = z.infer<typeof ClientShape>;

interface Place {
	readonly name: string;
	readonly side: string;
	readonly schemas: string;
	readonly generated: string;
}

const operationsOf = (client: Client): readonly Operation[] =>
	Object.values(client.paths).flatMap((methods) => Object.values(methods));

const paramsOf = ({ operationId }: Operation): string =>
	`${operationId.charAt(0).toUpperCase()}${operationId.slice(1)}Params`;

const helpOf = (client: Client): string => {
	const help = {
		description: client.info.description,
		commands: Object.fromEntries(
			operationsOf(client).map(({ operationId, description }) => [
				operationId,
				description,
			]),
		),
	};

	return `export const help = ${JSON.stringify(help, undefined, "\t")} as const;\n`;
};

const tupleOf = (operation: Operation): string =>
	operation.parameters
		.map(({ name }) => `${paramsOf(operation)}.shape.${name}`)
		.join(", ");

const argumentsOf = (name: string, operations: readonly Operation[]): string =>
	[
		'import { z } from "zod";',
		`import { ${operations.map(paramsOf).join(", ")} } from "./${name}.g.ts";`,
		"",
		...operations.map(
			(operation) =>
				`export const ${operation.operationId}Arguments = z.tuple([${tupleOf(operation)}]);`,
		),
		"",
	].join("\n");

const writeClient = async ({
	name,
	side,
	schemas,
	generated,
}: Place): Promise<void> => {
	const target = resolve(schemas, `${name}.openapi.json`);
	const document = await import(target, { with: { type: "json" } });
	const client = ClientShape.parse(document.default);

	await generate({
		input: {
			target,
			parserOptions: {
				externalRefs: { allow: ["domain.schema.json", "failures.schema.json"] },
			},
		},
		output: {
			client: "zod",
			mode: "single",
			target: resolve(generated, `perimeters/${name}.g.ts`),
			override: { zod: { version: 4, generateEachHttpStatus: true } },
		},
	});
	writeFileSync(resolve(generated, `client/${side}/help.g.ts`), helpOf(client));
	writeFileSync(
		resolve(generated, `perimeters/${side}-arguments.g.ts`),
		argumentsOf(name, operationsOf(client)),
	);
};

export { writeClient };
