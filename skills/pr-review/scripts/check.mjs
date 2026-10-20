import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLedger } from './lib.mjs';
import { run } from './shell.mjs';

const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const validate = (schema, file) => run('npx', ['--yes', '@sourcemeta/jsonschema@17.0.0', 'validate', join(skill, 'schemas', schema), file, '--resolve', join(skill, 'schemas')]);
export const yaml = (file) => JSON.parse(run('npx', ['--yes', 'js-yaml@4.1.0', file]));

export function check(instructionsFile) {
  const name = basename(instructionsFile).replace(/\.yaml$/, '');
  const document = yaml(instructionsFile);
  if (!existsSync(document.review.ledger)) throw new Error(`${name}: no ledger at ${document.review.ledger}`);
  validate('review/ledger.schema.json', document.review.ledger);
  const ledger = JSON.parse(readFileSync(document.review.ledger, 'utf8'));
  checkLedger(name, document, ledger);
  return { document, ledger };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [instructionsFile] = process.argv.slice(2);
  if (instructionsFile === undefined) throw new Error('usage: node check.mjs <instructions file>');
  check(resolve(instructionsFile));
  console.log('ledger accepted');
}
