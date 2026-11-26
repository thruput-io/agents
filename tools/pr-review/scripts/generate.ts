import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonSchemaToZod } from "json-schema-to-zod";

interface ValueSchema {
	readonly type: "string" | "object";
}

interface DomainDocument {
	readonly $defs: Readonly<Record<string, ValueSchema>>;
}

const WORD_START = /(?<lower>[a-z])(?<upper>[A-Z])/gu;

const kebabOf = (name: string): string =>
	name.replace(WORD_START, "$<lower>-$<upper>").toLowerCase();

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = resolve(root, "src/generated");
const target = resolve(generated, "domain");

rmSync(generated, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

const document: DomainDocument = JSON.parse(
	readFileSync(resolve(root, "schemas/domain.schema.json"), "utf8"),
);

const moduleOf = {
	string: (name: string, schema: ValueSchema): string =>
		[
			'import { Effect } from "effect";',
			'import { z } from "zod";',
			'import { NotValid } from "./not-valid.g.ts";',
			"",
			`const schema = ${jsonSchemaToZod(schema, { zodVersion: 4 })};`,
			"",
			`export class ${name} {`,
			"\tprivate readonly data: string;",
			"\tprivate constructor(data: string) {",
			"\t\tthis.data = data;",
			"\t\tObject.freeze(this);",
			"\t}",
			`\tstatic from(input: string): Effect.Effect<${name}, NotValid> {`,
			"\t\treturn Effect.try({",
			`\t\t\ttry: () => new ${name}(schema.parse(input)),`,
			"\t\t\tcatch: () => NotValid.create(),",
			"\t\t});",
			"\t}",
			`\tstatic dataOf(value: ${name}): string {`,
			"\t\treturn value.data;",
			"\t}",
			`\tisSameAs(other: ${name}): boolean {`,
			"\t\treturn this.data === other.data;",
			"\t}",
			"}",
			"",
		].join("\n"),
	object: (name: string): string =>
		[
			`export class ${name} {`,
			"\tprivate readonly data: Readonly<Record<string, never>> = {};",
			"\tprivate constructor() {",
			"\t\tObject.freeze(this);",
			"\t}",
			`\tstatic create(): ${name} {`,
			`\t\treturn new ${name}();`,
			"\t}",
			`\tstatic dataOf(value: ${name}): Readonly<Record<string, never>> {`,
			"\t\treturn value.data;",
			"\t}",
			"}",
			"",
		].join("\n"),
};

Object.entries(document.$defs).map(([name, schema]) =>
	writeFileSync(
		resolve(target, `${kebabOf(name)}.g.ts`),
		moduleOf[schema.type](name, schema),
	),
);

interface CommandSchema {
	readonly description: string;
}

interface ToolDocument {
	readonly description: string;
	readonly properties: Readonly<Record<string, CommandSchema>>;
}

const toolOf = (schemaFile: string): ToolDocument =>
	JSON.parse(readFileSync(resolve(root, "schemas", schemaFile), "utf8"));

const helpOf = (tool: ToolDocument): string => {
	const help = {
		description: tool.description,
		commands: Object.fromEntries(
			Object.entries(tool.properties).map(([name, { description }]) => [
				name,
				description,
			]),
		),
	};

	return `export const help = ${JSON.stringify(help, undefined, "\t")} as const;\n`;
};

const argumentsOf = (tool: ToolDocument): string =>
	[
		'import { z } from "zod";',
		"",
		...Object.entries(tool.properties).map(
			([name, schema]) =>
				`export const ${name}Arguments = ${jsonSchemaToZod(schema, { zodVersion: 4 })};`,
		),
		"",
	].join("\n");

const mainTool = toolOf("review-tool.schema.json");
const subTool = toolOf("review-tool-probe.schema.json");
const perimeters = resolve(generated, "perimeters");

mkdirSync(resolve(generated, "client/main"), { recursive: true });
mkdirSync(resolve(generated, "client/sub"), { recursive: true });
mkdirSync(perimeters, { recursive: true });
writeFileSync(resolve(generated, "client/main/help.g.ts"), helpOf(mainTool));
writeFileSync(resolve(generated, "client/sub/help.g.ts"), helpOf(subTool));
writeFileSync(
	resolve(perimeters, "main-arguments.g.ts"),
	argumentsOf(mainTool),
);
writeFileSync(resolve(perimeters, "sub-arguments.g.ts"), argumentsOf(subTool));
writeFileSync(
	resolve(perimeters, "answers.g.ts"),
	`import { z } from "zod";\n\nexport const failureAnswer = ${jsonSchemaToZod(toolOf("answers.schema.json"), { zodVersion: 4 })};\n`,
);
