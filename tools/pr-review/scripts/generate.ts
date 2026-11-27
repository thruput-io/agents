import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { generate } from "orval";
import { z } from "zod";
import { rulebookModule } from "./rulebook.ts";

const FIRST_ARGUMENT = 2;
const [projectRoot] = z
	.tuple([z.string().min(1)])
	.parse(process.argv.slice(FIRST_ARGUMENT));
const root = resolve(projectRoot, "tools/pr-review");
const generated = resolve(root, "src/generated");

rmSync(generated, { recursive: true, force: true });

const perimeters = resolve(generated, "perimeters");

mkdirSync(perimeters, { recursive: true });

writeFileSync(
	resolve(perimeters, "rulebook.g.ts"),
	rulebookModule(
		resolve(projectRoot, "skills/pr-review/rules"),
		resolve(root, "probes/probes.yaml"),
	),
);

await generate(resolve(root, "orval.config.json"), root);
