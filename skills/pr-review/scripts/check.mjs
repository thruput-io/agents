import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDomainJson, readDomainYaml } from './adapters/fs-store.mjs';
import { AgentInstructions } from './domain/agent-instructions.mjs';
import { Ledger } from './domain/ledger.mjs';

export function check(instructionsFile) {
  const name = basename(instructionsFile).replace(/\.yaml$/, '');
  const instructions = readDomainYaml(instructionsFile, AgentInstructions).unwrap();
  const ledgerPath = instructions.review().ledger().toContract();
  if (!existsSync(ledgerPath)) throw new Error(`${name}: no ledger at ${ledgerPath}`);
  const ledger = readDomainJson(ledgerPath, Ledger).unwrap();
  ledger.verifyAgainstInstructions(name, instructions).unwrap();
  return Object.freeze({ name, instructions, ledger });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [instructionsFile] = process.argv.slice(2);
  if (instructionsFile === undefined) throw new Error('usage: node check.mjs <instructions file>');
  check(resolve(instructionsFile));
  console.log('ledger accepted');
}
