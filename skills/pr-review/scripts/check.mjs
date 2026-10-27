import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AgentInstructionsSchema } from './domain/contracts.g.ts';
import { ledgerFor } from './domain/ledger.ts';
import { run } from './shell.mjs';

export const yaml = (file) => JSON.parse(run('npx', ['--yes', 'js-yaml@4.1.0', file]));

export function check(instructionsFile) {
  const name = basename(instructionsFile).replace(/\.yaml$/, '');
  const document = AgentInstructionsSchema.parse(yaml(instructionsFile));
  if (!existsSync(document.review.ledger)) throw new Error(`${name}: no ledger at ${document.review.ledger}`);
  try {
    const ledger = ledgerFor(document).parse(JSON.parse(readFileSync(document.review.ledger, 'utf8')));
    return { document, ledger };
  } catch (error) {
    throw new Error(`${name}: ${z.prettifyError(error)}`, { cause: error });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [instructionsFile] = process.argv.slice(2);
  if (instructionsFile === undefined) throw new Error('usage: node check.mjs <instructions file>');
  check(resolve(instructionsFile));
  console.log('ledger accepted');
}
