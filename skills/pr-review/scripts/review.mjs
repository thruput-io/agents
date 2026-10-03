import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLedger, merge, review, table } from './lib.mjs';

const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [workdirArg] = process.argv.slice(2);
if (workdirArg === undefined) throw new Error('usage: node review.mjs <workdir>');
const workdir = resolve(workdirArg);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  return result.stdout;
}
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const validate = (schema, file) => run('npx', ['--yes', '@sourcemeta/jsonschema@17.0.0', 'validate', join(skill, 'schemas', schema), file, '--resolve', join(skill, 'schemas')]);

const pullRequest = read(join(workdir, 'pull-request.json'));
const names = readdirSync(join(workdir, 'instructions')).filter((name) => name.endsWith('.json')).sort();
const probes = names.map((name) => ({ name: name.replace(/\.json$/, ''), document: read(join(workdir, 'instructions', name)) }));

const missing = probes.filter((probe) => !existsSync(probe.document.ledger));
if (missing.length > 0) {
  throw new Error(`no ledger from: ${missing.map((probe) => probe.name).join(', ')}. Re-run those probes; a probe that wrote nothing has not run.`);
}

const entries = probes.map((probe) => {
  validate('ledger.schema.json', probe.document.ledger);
  const ledger = read(probe.document.ledger);
  checkLedger(probe.name, probe.document, ledger);
  return { document: probe.document, ledger };
});

const merged = merge(entries.map((entry) => entry.ledger));
writeFileSync(join(workdir, 'ledger.json'), `${JSON.stringify(merged, null, 2)}\n`);
writeFileSync(join(workdir, 'ledger.md'), `${table(merged)}\n`);

const threads = read(join(workdir, 'threads.json'));
const payload = review(entries, { self: pullRequest.author === pullRequest.reviewer, threads });
const file = join(workdir, 'review.json');
writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);

const { owner, repository, number } = pullRequest.host;
const response = JSON.parse(run('gh', ['api', '-X', 'POST', `repos/${owner}/${repository}/pulls/${number}/reviews`, '--input', file]));
writeFileSync(join(workdir, 'response.json'), `${JSON.stringify(response, null, 2)}\n`);
console.log(JSON.stringify({ review: response.html_url, event: payload.event, rows: merged.rows.length, comments: payload.comments.length }, null, 2));
