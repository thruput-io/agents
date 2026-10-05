import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDiff, parseHunks, threadRanges, wholeSurface, narrowSurface, definitions, callSites, deadCode, isText, partition, kindOf, checkKinds,
  rulebook, rawUrl, rulesets, instructions,
} from './lib.mjs';

const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [url, workdirArg] = process.argv.slice(2);
if (workdirArg === undefined) throw new Error('usage: node prepare.mjs <pull-request-url> <workdir>');

function run(command, args, encoding = 'utf8') {
  const result = spawnSync(command, args, { encoding, maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`);
  return result.stdout;
}
const gh = (...args) => JSON.parse(run('gh', ['api', ...args]));
function paginate(path) {
  const items = [];
  for (let page = 1; ; page += 1) {
    const batch = gh(`${path}?per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}
const validate = (schema, file) => run('npx', ['--yes', '@sourcemeta/jsonschema@17.0.0', 'validate', join(skill, 'schemas', schema), file, '--resolve', join(skill, 'schemas')]);
const yaml = (name) => JSON.parse(run('npx', ['--yes', 'js-yaml@4.1.0', join(skill, 'rules', name)]));

const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(url);
if (match === null) throw new Error(`${url} is not a GitHub pull request URL; for Azure DevOps follow references/az-cheat-sheet.md`);
const [, owner, repository, numberText] = match;
const number = Number(numberText);
const pulls = `repos/${owner}/${repository}/pulls/${number}`;

const pr = gh(pulls);
const headCommit = pr.head.sha;

const diff = run('gh', ['api', pulls, '-H', 'Accept: application/vnd.github.diff']);
const changeSet = { headCommit, files: parseDiff(diff) };

const workdir = resolve(workdirArg);
mkdirSync(join(workdir, 'instructions'), { recursive: true });
mkdirSync(join(workdir, 'ledger'), { recursive: true });
const write = (name, document) => {
  const file = join(workdir, name);
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  return file;
};

const me = gh('graphql', '-f', 'query={viewer{login}}').data.viewer.login;
const pullRequest = { host: { kind: 'github', owner, repository, number }, author: pr.user.login, reviewer: me, description: pr.body ?? '' };
write('pull-request.json', pullRequest);

const checks = gh(`repos/${owner}/${repository}/commits/${headCommit}/check-runs`);
const failed = checks.check_runs.filter((check) => !['success', 'skipped', 'neutral'].includes(check.conclusion)).map((check) => check.name);
const blocked = [...failed.map((name) => `check ${name} did not succeed`), ...(pr.mergeable_state === 'dirty' ? ['the pull request has merge conflicts'] : [])];
if (blocked.length > 0) {
  const body = `**Verdict: REQUEST_CHANGES**\n\nNot reviewed at ${headCommit}: ${blocked.join('; ')}.`;
  const rejection = write('review.json', { commit_id: headCommit, event: pullRequest.author === me ? 'COMMENT' : 'REQUEST_CHANGES', body });
  run('gh', ['api', '-X', 'POST', `${pulls}/reviews`, '--input', rejection]);
  throw new Error(`${blocked.join('; ')}. A changes-requested verdict was posted; no review was prepared.`);
}

const reviews = paginate(`${pulls}/reviews`);
const prior = reviews.filter((review) => review.user.login === me && review.state !== 'PENDING').at(-1);

function allThreads() {
  const threads = [];
  let after = null;
  do {
    const query = 'query($owner:String!,$repository:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repository){pullRequest(number:$number){reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{path line startLine diffSide isResolved resolvedBy{login}comments(first:1){nodes{author{login}body}}}}}}}';
    const page = gh('graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `repository=${repository}`, '-F', `number=${number}`, ...(after === null ? [] : ['-F', `after=${after}`]))
      .data.repository.pullRequest.reviewThreads;
    threads.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after !== null);
  return threads;
}
const threads = prior === undefined ? [] : allThreads();
write('threads.json', threads.filter((thread) => !thread.isResolved && thread.line !== null && thread.comments.nodes[0]?.author.login === me)
  .map((thread) => ({ path: thread.path, line: thread.line, body: thread.comments.nodes[0].body })));

function narrowed() {
  const compare = gh(`repos/${owner}/${repository}/compare/${prior.commit_id}...${headCommit}`);
  const changedSince = new Map(compare.files.filter((file) => file.patch !== undefined)
    .map((file) => [file.filename, parseHunks(file.patch.split('\n')).added]));
  return narrowSurface(changeSet, changedSince, threadRanges(threads, pr.user.login));
}
const surface = prior === undefined ? wholeSurface(changeSet) : narrowed();
if (surface.files.length === 0) {
  throw new Error(`nothing to review: no line of the change set changed since the prior review at ${prior.commit_id}, and no thread of ours is open or was resolved by the author`);
}

const snapshot = join(workdir, 'snapshot');
mkdirSync(snapshot, { recursive: true });
const tarball = join(workdir, 'snapshot.tgz');
writeFileSync(tarball, run('gh', ['api', `repos/${owner}/${repository}/tarball/${headCommit}`], 'buffer'));
run('tar', ['-xzf', tarball, '-C', snapshot, '--strip-components=1']);
const paths = readdirSync(snapshot, { recursive: true }).map(String)
  .filter((path) => statSync(join(snapshot, path)).isFile()).sort();
const scanned = new Map();
const read = (path) => {
  if (!scanned.has(path)) scanned.set(path, readFileSync(join(snapshot, path), 'latin1'));
  return scanned.get(path);
};
const changed = changeSet.files.map((file) => file.path);
const defined = definitions(diff);
const sites = callSites(changed, [...defined.added, ...defined.removed], paths, read);
const dead = deadCode(diff, paths, read);
const deadPaths = Object.values(dead).flat().flatMap((entry) => entry.definedIn ?? entry.usedIn);

const { rules } = yaml('Rules.yaml');
const governance = { principles: yaml('Principles.yaml').principles, definitions: yaml('Definitions.yaml').definitions };

const atHead = (candidates) => [...new Set(candidates)].filter((path) => paths.includes(path) && isText(read(path)))
  .map((path) => ({ path, content: readFileSync(join(snapshot, path), 'utf8') }));
const around = (candidates) => ({ callSites: sites, files: atHead(candidates.filter((path) => !changed.includes(path))) });
const context = {
  review: { pullRequest, changeSet, surface, files: atHead(changed) },
  beyond: {
    rules: {},
    'reuse-ladder': {},
    'dead-code': { surroundings: around([...sites.into, ...sites.outOf, ...deadPaths]), deadCode: dead },
  },
  ledger: (name) => join(workdir, 'ledger', `${name}.json`),
};
rmSync(snapshot, { recursive: true });
rmSync(tarball);

validate('review/change-set.schema.json', write('change-set.json', changeSet));
validate('review/surface.schema.json', write('surface.json', surface));

const index = JSON.parse(readFileSync(join(skill, 'references', 'agent-rules-books-search-index.json'), 'utf8'));
const texts = new Map();
for (const entry of index) {
  const response = await fetch(rawUrl(entry.canonical_url));
  if (!response.ok) throw new Error(`the ruleset ${entry.canonical_url} could not be read: HTTP ${response.status}`);
  texts.set(entry.canonical_url, await response.text());
}

const groups = partition(rules);
checkKinds(groups.map((group) => group.group));
const probes = instructions(
  context,
  groups.map((group) => ({ name: group.name, kind: kindOf(group.group), rulebook: rulebook(group.rules, governance) })),
  rulesets(index, texts),
);
for (const probe of probes) validate('review/agent-instructions.schema.json', write(join('instructions', `${probe.name}.json`), probe.document));

const count = (files, side) => files.reduce((sum, file) => sum + file[side].reduce((n, range) => n + range.end - range.start + 1, 0), 0);
const summary = {
  pullRequest: url,
  headCommit,
  mergeableState: pr.mergeable_state,
  checks: checks.total_count,
  descriptionLength: pullRequest.description.length,
  since: prior === undefined ? pr.base.sha : prior.commit_id,
  changeSet: { files: changeSet.files.length, added: count(changeSet.files, 'added'), removed: count(changeSet.files, 'removed') },
  surface: { files: surface.files.length, added: count(surface.files, 'added'), removed: count(surface.files, 'removed') },
  callSites: { into: sites.into.length, outOf: sites.outOf.length },
  deadCode: Object.fromEntries(Object.entries(dead).map(([kind, entries]) => [kind, entries.length])),
  repository: paths.length,
  probes: probes.map((probe) => probe.name),
  rules: rules.length,
};
write('summary.json', summary);
console.log(JSON.stringify(summary, null, 2));
