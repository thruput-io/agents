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
			"\treadonly #data: string;",
			"\tprivate constructor(data: string) {",
			"\t\tthis.#data = data;",
			"\t\tObject.freeze(this);",
			"\t}",
			`\tstatic from(input: string): Effect.Effect<${name}, NotValid> {`,
			"\t\tconst parsed = schema.safeParse(input);",
			`\t\treturn parsed.success ? Effect.succeed(new ${name}(parsed.data)) : Effect.fail(NotValid.create());`,
			"\t}",
			`\tstatic dataOf(value: ${name}): string {`,
			"\t\treturn value.#data;",
			"\t}",
			"}",
			"",
		].join("\n"),
	object: (name: string): string =>
		[
			`export class ${name} {`,
			"\treadonly #data: Readonly<Record<string, never>>;",
			"\tprivate constructor() {",
			"\t\tthis.#data = {};",
			"\t\tObject.freeze(this);",
			"\t}",
			`\tstatic create(): ${name} {`,
			`\t\treturn new ${name}();`,
			"\t}",
			`\tstatic dataOf(value: ${name}): Readonly<Record<string, never>> {`,
			"\t\treturn value.#data;",
			"\t}",
			"}",
			"",
		].join("\n"),
};

Object.entries(document.$defs).map(([name, schema]) =>
	writeFileSync(
		resolve(
			target,
			`${name.replace(WORD_START, "$<lower>-$<upper>").toLowerCase()}.g.ts`,
		),
		moduleOf[schema.type](name, schema),
	),
);
