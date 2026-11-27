import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { z } from "zod";
import { writeClient } from "./client.ts";
import { rulebookModule } from "./rulebook.ts";

interface ValueSchema {
	readonly type: "string" | "object";
}

interface DomainDocument {
	readonly $defs: Readonly<Record<string, ValueSchema>>;
}

const WORD_START = /(?<lower>[a-z])(?<upper>[A-Z])/gu;

const kebabOf = (name: string): string =>
	name.replace(WORD_START, "$<lower>-$<upper>").toLowerCase();

const FIRST_ARGUMENT = 2;
const [projectRoot] = z
	.tuple([z.string().min(1)])
	.parse(process.argv.slice(FIRST_ARGUMENT));
const root = resolve(projectRoot, "tools/pr-review");
const generated = resolve(root, "src/generated");
const target = resolve(generated, "domain");

rmSync(generated, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

const document: DomainDocument = JSON.parse(
	readFileSync(resolve(root, "schemas/domain.schema.json"), "utf8"),
);

const valueModuleOf = {
	string: (name: string, schema: ValueSchema): string =>
		[
			'import { z } from "zod";',
			"",
			`const schema = ${jsonSchemaToZod(schema, { zodVersion: 4 })};`,
			"",
			`export class ${name} {`,
			"\tprivate readonly data: z.infer<typeof schema>;",
			"\tprivate constructor(data: z.infer<typeof schema>) {",
			"\t\tthis.data = data;",
			"\t\tObject.freeze(this);",
			"\t}",
			`\tstatic readonly codec = z.codec(schema, z.custom<${name}>((value) => value instanceof ${name}), {`,
			`\t\tdecode: (data) => new ${name}(data),`,
			"\t\tencode: (value) => value.data,",
			"\t});",
			`\tisSameAs(other: ${name}): boolean {`,
			"\t\treturn this.data === other.data;",
			"\t}",
			"}",
			"",
		].join("\n"),
	object: (name: string): string =>
		[
			'import { z } from "zod";',
			"",
			`export class ${name} {`,
			"\tprivate readonly data: Readonly<Record<string, never>>;",
			"\tprivate constructor(data: Readonly<Record<string, never>>) {",
			"\t\tthis.data = data;",
			"\t\tObject.freeze(this);",
			"\t}",
			`\tstatic readonly codec = z.codec(z.strictObject({}), z.custom<${name}>((value) => value instanceof ${name}), {`,
			`\t\tdecode: (data) => new ${name}(data),`,
			"\t\tencode: (value) => value.data,",
			"\t});",
			"}",
			"",
		].join("\n"),
};

const failureOf = (name: string): string =>
	[
		`export class ${name} {`,
		"\tdeclare private readonly nominal: never;",
		"\tprivate constructor() {",
		"\t\tObject.freeze(this);",
		"\t}",
		`\tstatic create(): ${name} {`,
		`\t\treturn new ${name}();`,
		"\t}",
		"}",
		"",
	].join("\n");

const failures: DomainDocument = JSON.parse(
	readFileSync(resolve(root, "schemas/failures.schema.json"), "utf8"),
);

Object.entries(document.$defs).map(([name, schema]) =>
	writeFileSync(
		resolve(target, `${kebabOf(name)}.g.ts`),
		valueModuleOf[schema.type](name, schema),
	),
);
const signals: DomainDocument = JSON.parse(
	readFileSync(resolve(root, "schemas/signals.schema.json"), "utf8"),
);

[...Object.keys(failures.$defs), ...Object.keys(signals.$defs)].map((name) =>
	writeFileSync(resolve(target, `${kebabOf(name)}.g.ts`), failureOf(name)),
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

const subTool = toolOf("review-tool-probe.schema.json");
const perimeters = resolve(generated, "perimeters");

mkdirSync(resolve(generated, "client/main"), { recursive: true });
mkdirSync(resolve(generated, "client/sub"), { recursive: true });
mkdirSync(perimeters, { recursive: true });
writeFileSync(resolve(generated, "client/sub/help.g.ts"), helpOf(subTool));
writeFileSync(resolve(perimeters, "sub-arguments.g.ts"), argumentsOf(subTool));
writeFileSync(
	resolve(perimeters, "answers.g.ts"),
	`import { z } from "zod";\n\nexport const failureAnswer = ${jsonSchemaToZod(toolOf("failures.schema.json"), { zodVersion: 4 })};\n`,
);

writeFileSync(
	resolve(perimeters, "rulebook.g.ts"),
	rulebookModule(
		resolve(projectRoot, "skills/pr-review/rules"),
		resolve(root, "probes/probes.yaml"),
	),
);

await writeClient({
	name: "review-tool",
	side: "main",
	schemas: resolve(root, "schemas"),
	generated,
});
