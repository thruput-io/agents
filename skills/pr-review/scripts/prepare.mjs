import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiff, parseHunks, threadRanges, narrowSurface, definitions, callSites, partition, instructions } from './lib.mjs';

const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = 'https://thruput.se/agents/';
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

const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(url);
if (match === null) throw new Error(`${url} is not a GitHub pull request URL; for Azure DevOps follow references/az-cheat-sheet.md`);
const [, owner, repository, numberText] = match;
const number = Number(numberText);
const pulls = `repos/${owner}/${repository}/pulls/${number}`;

const pr = gh(pulls);
const headCommit = pr.head.sha;

const diff = run('gh', ['api', pulls, '-H', 'Accept: application/vnd.github.diff']);
const changeSet = { headCommit, files: parseDiff(diff) };

const me = gh('user').login;
const reviews = paginate(`${pulls}/reviews`);
const prior = reviews.filter((review) => review.user.login === me && review.state !== 'PENDING').at(-1);

function narrowed() {
  const compare = gh(`repos/${owner}/${repository}/compare/${prior.commit_id}...${headCommit}`);
  const changedSince = new Map(compare.files.filter((file) => file.patch !== undefined)
    .map((file) => [file.filename, parseHunks(file.patch.split('\n')).added]));
  const threads = [];
  let after = null;
  do {
    const query = 'query($owner:String!,$repository:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repository){pullRequest(number:$number){reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{path line startLine diffSide isResolved resolvedBy{login}}}}}}';
    const page = gh('graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `repository=${repository}`, '-F', `number=${number}`, ...(after === null ? [] : ['-F', `after=${after}`]))
      .data.repository.pullRequest.reviewThreads;
    threads.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after !== null);
  return narrowSurface(changeSet, changedSince, threadRanges(threads, pr.user.login));
}
const lines = prior === undefined ? changeSet : narrowed();

const workdir = resolve(workdirArg);
mkdirSync(join(workdir, 'instructions'), { recursive: true });
mkdirSync(join(workdir, 'ledger'), { recursive: true });
const write = (name, document) => {
  const file = join(workdir, name);
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  return file;
};

const snapshot = join(workdir, 'snapshot');
mkdirSync(snapshot, { recursive: true });
const tarball = join(workdir, 'snapshot.tgz');
writeFileSync(tarball, run('gh', ['api', `repos/${owner}/${repository}/tarball/${headCommit}`], 'buffer'));
run('tar', ['-xzf', tarball, '-C', snapshot, '--strip-components=1']);
const paths = readdirSync(snapshot, { recursive: true }).map(String)
  .filter((path) => statSync(join(snapshot, path)).isFile()).sort();
const read = (path) => readFileSync(join(snapshot, path), 'latin1');
const changed = changeSet.files.map((file) => file.path);
const surface = { ...lines, callSites: callSites(changed, definitions(diff), paths, read) };

const reading = { files: join(workdir, 'files'), diff: join(workdir, 'changes.diff'), tree: join(workdir, 'tree.txt') };
writeFileSync(reading.diff, diff);
writeFileSync(reading.tree, `${paths.join('\n')}\n`);
for (const path of [...changed, ...surface.callSites.into, ...surface.callSites.outOf].filter((file) => paths.includes(file))) {
  cpSync(join(snapshot, path), join(reading.files, path));
}
rmSync(snapshot, { recursive: true });
rmSync(tarball);

validate('change-set.schema.json', write('change-set.json', changeSet));
validate('surface.schema.json', write('surface.json', surface));

const pullRequest = { url, host: { kind: 'github', owner, repository, number }, description: pr.body ?? '' };
write('pull-request.json', pullRequest);

const { rules } = JSON.parse(run('npx', ['--yes', 'js-yaml@4.1.0', join(skill, 'rules', 'Rules.yaml')]));
const context = {
  probe: { ruleSource: `${join(skill, 'rules')}/`, site },
  shared: { pullRequest, changeSet, surface, reading },
  ledger: (name) => join(workdir, 'ledger', `${name}.json`),
};
const probes = instructions(context, partition(rules), join(skill, 'references', 'agent-rules-books-INDEX.md'));
for (const probe of probes) validate('agent-instructions.schema.json', write(join('instructions', `${probe.name}.json`), probe.document));

const checks = gh(`repos/${owner}/${repository}/commits/${headCommit}/check-runs`);
const count = (files, side) => files.reduce((sum, file) => sum + file[side].reduce((n, range) => n + range.end - range.start + 1, 0), 0);
const summary = {
  pullRequest: url,
  headCommit,
  mergeableState: pr.mergeable_state,
  checks: { total: checks.total_count, failed: checks.check_runs.filter((check) => !['success', 'skipped', 'neutral'].includes(check.conclusion)).length },
  descriptionLength: pullRequest.description.length,
  since: prior === undefined ? pr.base.sha : prior.commit_id,
  changeSet: { files: changeSet.files.length, added: count(changeSet.files, 'added'), removed: count(changeSet.files, 'removed') },
  surface: { files: surface.files.length, added: count(surface.files, 'added'), removed: count(surface.files, 'removed'), callSites: { into: surface.callSites.into.length, outOf: surface.callSites.outOf.length } },
  repository: paths.length,
  probes: probes.map((probe) => probe.name),
  rules: rules.length,
};
write('summary.json', summary);
console.log(JSON.stringify(summary, null, 2));
