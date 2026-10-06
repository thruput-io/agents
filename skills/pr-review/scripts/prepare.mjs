import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDiff, threadRanges, wholeSurface, narrowSurface, isText, partition, kindOf, checkKinds, rulebook, rawUrl, rulesets,
  instructions, complete, numbered, fragments, removedLines, tooLarge, FILE_TOO_LARGE,
} from './lib.mjs';
import { run } from './shell.mjs';
import * as github from './github.mjs';
import * as azureDevOps from './azure-devops.mjs';
import * as git from './git.mjs';

const ADAPTERS = [github, azureDevOps, git];
const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [target, workdirArg] = process.argv.slice(2);
if (workdirArg === undefined) throw new Error('usage: node prepare.mjs <pull-request-url | repository@base..head> <workdir>');

const validate = (schema, file) => run('npx', ['--yes', '@sourcemeta/jsonschema@17.0.0', 'validate', join(skill, 'schemas', schema), file, '--resolve', join(skill, 'schemas')]);
const yaml = (name) => JSON.parse(run('npx', ['--yes', 'js-yaml@4.1.0', join(skill, 'rules', name)]));
const schema = (name) => JSON.parse(readFileSync(join(skill, 'schemas', name), 'utf8'));
const jsYaml = createRequire(run('npx', ['--yes', '--package', 'js-yaml@4.1.0', '-c', 'command -v js-yaml']).trim())('js-yaml');

const located = ADAPTERS.map((adapter) => ({ adapter, host: adapter.locate(target) })).find(({ host }) => host !== undefined);
if (located === undefined) throw new Error(`${target} is not a pull request URL this skill knows, nor a repository@base..head range`);
const { adapter, host } = located;

const workdir = resolve(workdirArg);
mkdirSync(join(workdir, 'instructions'), { recursive: true });
mkdirSync(join(workdir, 'ledger'), { recursive: true });
const write = (name, document) => {
  const file = join(workdir, name);
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  return file;
};

const change = adapter.resolve(host, workdir);
const { pullRequest, headCommit } = change;
write('pull-request.json', pullRequest);
if (change.blocked.length > 0) {
  const where = change.refused ?? adapter.refuse(host, headCommit, change.blocked, workdir);
  throw new Error(`${change.blocked.join('; ')}. A changes-requested verdict ${change.refused === undefined ? 'was posted' : 'had been posted'} (${where}); no review was prepared.`);
}

const changeSet = { headCommit, files: parseDiff(change.diff()) };
validate('review/change-set.schema.json', write('change-set.json', changeSet));
validate('review/threads.schema.json', write('threads.json', { threads: change.threads }));
const surface = change.prior === undefined ? wholeSurface(changeSet) : narrowSurface(changeSet, change.changedSince(change.prior), threadRanges(change.threads));
if (surface.files.length === 0) {
  throw new Error(`nothing to review: no line of the change set changed since the prior review at ${change.prior}, and no thread of ours is open or was resolved by the author`);
}

const snapshot = join(workdir, 'snapshot');
change.checkout(snapshot);
const paths = readdirSync(snapshot, { recursive: true }).map(String).filter((path) => statSync(join(snapshot, path)).isFile()).sort();
const linesAtHead = (path) => (paths.includes(path) && isText(readFileSync(join(snapshot, path), 'latin1')) ? numbered(readFileSync(join(snapshot, path), 'utf8')) : {});
const oversized = tooLarge(changeSet.files.map((file) => ({ path: file.path, lines: Object.keys(linesAtHead(file.path)).length })));
if (oversized.length > 0) {
  const where = change.refused ?? adapter.refuse(host, headCommit, oversized, workdir);
  throw new Error(`${oversized.join('; ')}. A changes-requested verdict ${change.refused === undefined ? 'was posted' : 'had been posted'} (${where}); no review was prepared.`);
}
const files = surface.files.map((file) => {
  const hunks = changeSet.files.find((candidate) => candidate.path === file.path).removed;
  return { path: file.path, fragments: fragments(linesAtHead(file.path), file.added, removedLines(hunks, file.removed)) };
}).filter((file) => file.fragments.length > 0);

const { rules } = yaml('Rules.yaml');
const governance = { principles: yaml('Principles.yaml').principles, definitions: yaml('Definitions.yaml').definitions };
const context = {
  review: { pullRequest, headCommit, files },
  checkout: snapshot,
  ledger: (name) => join(workdir, 'ledger', `${name}.json`),
  report: (name) => `npx --yes @sourcemeta/jsonschema@17.0.0 validate "${join(skill, 'schemas', 'review/ledger.schema.json')}" "${join(workdir, 'ledger', `${name}.json`)}" --resolve "${join(skill, 'schemas')}"`,
};

const index = JSON.parse(readFileSync(join(skill, 'references', 'agent-rules-books-search-index.json'), 'utf8'));
const texts = new Map();
for (const entry of index) {
  const response = await fetch(rawUrl(entry.canonical_url));
  if (!response.ok) throw new Error(`the ruleset ${entry.canonical_url} could not be read: HTTP ${response.status}`);
  texts.set(entry.canonical_url, await response.text());
}

const groups = partition(rules.filter((rule) => rule.id !== FILE_TOO_LARGE));
checkKinds(groups.map((group) => group.group));
const probes = instructions(
  context,
  groups.map((group) => ({ name: group.name, kind: kindOf(group.group), rulebook: rulebook(group.rules, governance) })),
  rulesets(index, texts),
);
for (const probe of probes) {
  const file = join(workdir, 'instructions', `${probe.name}.yaml`);
  writeFileSync(file, jsYaml.dump(complete(schema, 'review/agent-instructions.schema.json', probe.document), { lineWidth: -1, noRefs: true }));
  validate('review/agent-instructions.schema.json', file);
}

const count = (files, side) => files.reduce((sum, file) => sum + file[side].reduce((n, range) => n + range.end - range.start + 1, 0), 0);
const summary = {
  host: host.kind,
  headCommit,
  since: change.prior ?? null,
  threadsOfOurs: change.threads.length,
  changeSet: { files: changeSet.files.length, added: count(changeSet.files, 'added'), removed: count(changeSet.files, 'removed') },
  surface: { files: surface.files.length, added: count(surface.files, 'added'), removed: count(surface.files, 'removed') },
  repository: paths.length,
  probes: probes.map((probe) => `${probe.name} (${probe.document.kind})`),
  rules: rules.length,
};
write('summary.json', summary);
console.log(JSON.stringify(summary, null, 2));
