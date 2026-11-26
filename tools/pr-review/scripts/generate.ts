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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = resolve(root, "src/generated");
const target = resolve(generated, "domain");

rmSync(generated, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

const document: DomainDocument = JSON.parse(
	readFileSync(resolve(root, "schemas/domain.schema.json"), "utf8"),
);
const values = Object.entries(document.$defs).map(([name, schema]) => ({
	name,
	schema,
	mark: `${name.charAt(0).toLowerCase()}${name.slice(1)}Mark`,
	factory: `${name.charAt(0).toLowerCase()}${name.slice(1)}From`,
}));

const factoryOf = {
	string: (name: string, mark: string): string =>
		`(text: string): ${name} => mint({ text, [${mark}]: ${mark} })`,
	object: (name: string, mark: string): string =>
		`(): ${name} => mint({ [${mark}]: ${mark} })`,
};

const marks = values.map(({ mark }) => mark).join(", ");
const names = values.map(({ name }) => name).join(", ");

const schemas = values.map(
	({ name, schema }) =>
		`export const ${name}Schema = ${jsonSchemaToZod(schema, { zodVersion: 4 })};`,
);
const markLines = values.map(
	({ name, mark }) =>
		`export const ${mark}: unique symbol = Symbol("${name}");`,
);
const interfaces = values.map(
	({ name, mark }) =>
		`export interface ${name} { readonly [${mark}]: typeof ${mark}; }`,
);
const factories = values.map(
	({ name, schema, mark, factory }) =>
		`export const ${factory} = ${factoryOf[schema.type](name, mark)};`,
);

writeFileSync(
	resolve(target, "schema.g.ts"),
	`import { z } from "zod";\n\n${schemas.join("\n")}\n`,
);
writeFileSync(resolve(target, "mark.g.ts"), `${markLines.join("\n")}\n`);
writeFileSync(
	resolve(target, "value.g.ts"),
	`import type { ${marks} } from "./mark.g.ts";\n\n${interfaces.join("\n")}\n`,
);
writeFileSync(
	resolve(target, "factory.g.ts"),
	`import { mint } from "../../domain/mint.ts";\nimport { ${marks} } from "./mark.g.ts";\nimport type { ${names} } from "./value.g.ts";\n\n${factories.join("\n")}\n`,
);
