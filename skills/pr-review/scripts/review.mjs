import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLedger, merge, outcome, table } from './lib.mjs';
import { run } from './shell.mjs';
import * as github from './github.mjs';
import * as azureDevOps from './azure-devops.mjs';
import * as git from './git.mjs';

const ADAPTERS = [github, azureDevOps, git];
const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [workdirArg] = process.argv.slice(2);
if (workdirArg === undefined) throw new Error('usage: node review.mjs <workdir>');
const workdir = resolve(workdirArg);

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const yaml = (file) => JSON.parse(run('npx', ['--yes', 'js-yaml@4.1.0', file]));
const validate = (schema, file) => run('npx', ['--yes', '@sourcemeta/jsonschema@17.0.0', 'validate', join(skill, 'schemas', schema), file, '--resolve', join(skill, 'schemas')]);

const pullRequest = read(join(workdir, 'pull-request.json'));
const adapter = ADAPTERS.find((candidate) => candidate.KIND === pullRequest.host.kind);
if (adapter === undefined) throw new Error(`no adapter for the host ${pullRequest.host.kind}`);

const names = readdirSync(join(workdir, 'instructions')).filter((name) => name.endsWith('.yaml')).sort();
const probes = names.map((name) => ({ name: name.replace(/\.yaml$/, ''), document: yaml(join(workdir, 'instructions', name)) }));
const missing = probes.filter((probe) => !existsSync(probe.document.review.ledger));
if (missing.length > 0) {
  throw new Error(`no ledger from: ${missing.map((probe) => probe.name).join(', ')}. Re-run those probes; a probe that wrote nothing has not run.`);
}
const entries = probes.map((probe) => {
  validate('review/ledger.schema.json', probe.document.review.ledger);
  const ledger = read(probe.document.review.ledger);
  checkLedger(probe.name, probe.document, ledger);
  return { document: probe.document, ledger };
});

const merged = merge(entries.map((entry) => entry.ledger));
const ledgerFile = join(workdir, 'ledger.json');
writeFileSync(ledgerFile, `${JSON.stringify(merged, null, 2)}\n`);
validate('review/ledger.schema.json', ledgerFile);
const ledgerTable = table(merged);
writeFileSync(join(workdir, 'ledger.md'), `${ledgerTable}\n`);

const decided = outcome(entries, read(join(workdir, 'threads.json')).threads);
const outcomeFile = join(workdir, 'outcome.json');
writeFileSync(outcomeFile, `${JSON.stringify(decided, null, 2)}\n`);
validate('review/outcome.schema.json', outcomeFile);

const posted = adapter.post(pullRequest.host, decided, ledgerTable, workdir);
console.log(JSON.stringify({ verdict: decided.verdict, rows: merged.rows.length, ...posted }, null, 2));
