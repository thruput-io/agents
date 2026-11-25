import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type JsonSchema, jsonSchemaToZod } from "json-schema-to-zod";

interface DomainDocument {
	readonly $defs: Readonly<Record<string, JsonSchema>>;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "schemas/domain.schema.json");
const target = resolve(root, "src/generated/domain/domain.g.ts");

const document: DomainDocument = JSON.parse(readFileSync(source, "utf8"));

const declarations = Object.entries(document.$defs).map(
	([name, schema]) =>
		`export const ${name}Schema = ${jsonSchemaToZod(schema, { zodVersion: 4 })};\nexport type ${name}Data = z.infer<typeof ${name}Schema>;`,
);

mkdirSync(dirname(target), { recursive: true });
writeFileSync(
	target,
	`import { z } from "zod";\n\n${declarations.join("\n\n")}\n`,
	"utf8",
);
