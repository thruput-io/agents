import { resolve } from 'node:path';
import { z } from 'zod';
import { DEFS, SCHEMAS } from '../.generated/contracts.mjs';
import { Identifier, PositiveInteger, Ref, RepositoryPath } from './primitives.mjs';
import { Result } from './result.mjs';

const hostSchema = z.fromJSONSchema(DEFS['pull-request.schema.json#/$defs/Host']);
const pullRequestSchema = z.fromJSONSchema(SCHEMAS['pull-request.schema.json']);
const ghToken = Symbol('GitHubHost');
const adoToken = Symbol('AzureDevOpsHost');
const gitToken = Symbol('GitHost');
const hostToken = Symbol('Host');
const prToken = Symbol('PullRequest');

const GITHUB_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
const AZURE_URL = /^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/;
const GIT_SPEC = /^(.+)@([^.]+(?:\.[^.]+)*)\.\.([^.].*)$/;

export class GitHubHost {
  #owner;
  #repository;
  #number;
  constructor(guard, owner, repository, number) {
    if (guard !== ghToken) throw new Error('Use Host.fromRaw to construct GitHubHost');
    this.#owner = owner;
    this.#repository = repository;
    this.#number = number;
    Object.freeze(this);
  }
  owner() {
    return this.#owner;
  }
  repository() {
    return this.#repository;
  }
  number() {
    return this.#number;
  }
  toContract() {
    return { kind: 'github', owner: this.#owner.toContract(), repository: this.#repository.toContract(), number: this.#number.toContract() };
  }
}

export class AzureDevOpsHost {
  #organization;
  #project;
  #repository;
  #id;
  constructor(guard, organization, project, repository, id) {
    if (guard !== adoToken) throw new Error('Use Host.fromRaw to construct AzureDevOpsHost');
    this.#organization = organization;
    this.#project = project;
    this.#repository = repository;
    this.#id = id;
    Object.freeze(this);
  }
  organization() {
    return this.#organization;
  }
  project() {
    return this.#project;
  }
  repository() {
    return this.#repository;
  }
  id() {
    return this.#id;
  }
  toContract() {
    return {
      kind: 'azure-devops',
      organization: this.#organization.toContract(),
      project: this.#project.toContract(),
      repository: this.#repository.toContract(),
      id: this.#id.toContract(),
    };
  }
}

export class GitHost {
  #repository;
  #base;
  #head;
  constructor(guard, repository, base, head) {
    if (guard !== gitToken) throw new Error('Use Host.fromRaw to construct GitHost');
    this.#repository = repository;
    this.#base = base;
    this.#head = head;
    Object.freeze(this);
  }
  repository() {
    return this.#repository;
  }
  base() {
    return this.#base;
  }
  head() {
    return this.#head;
  }
  toContract() {
    return { kind: 'git', repository: this.#repository.toContract(), base: this.#base.toContract(), head: this.#head.toContract() };
  }
}

export class Host {
  #tag;
  #value;
  constructor(guard, tag, value) {
    if (guard !== hostToken) throw new Error('Use Host.fromRaw or Host.fromSpec to construct Host');
    this.#tag = tag;
    this.#value = value;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(hostSchema, raw, (v) => v).flatMap((v) => {
      if (v.kind === 'github') {
        return Identifier.fromRaw(v.owner).flatMap((owner) =>
          Identifier.fromRaw(v.repository).flatMap((repo) =>
            PositiveInteger.fromRaw(v.number).map((num) => new Host(hostToken, 'github', new GitHubHost(ghToken, owner, repo, num))),
          ),
        );
      }
      if (v.kind === 'azure-devops') {
        return Identifier.fromRaw(v.organization).flatMap((org) =>
          Identifier.fromRaw(v.project).flatMap((proj) =>
            Identifier.fromRaw(v.repository).flatMap((repo) =>
              PositiveInteger.fromRaw(v.id).map((id) => new Host(hostToken, 'azureDevOps', new AzureDevOpsHost(adoToken, org, proj, repo, id))),
            ),
          ),
        );
      }
      return RepositoryPath.fromRaw(v.repository).flatMap((repo) =>
        Ref.fromRaw(v.base).flatMap((base) =>
          Ref.fromRaw(v.head).map((head) => new Host(hostToken, 'git', new GitHost(gitToken, repo, base, head))),
        ),
      );
    });
  }
  static fromSpec(spec) {
    if (typeof spec !== 'string') return Result.err('Host: spec must be a string');
    const gh = GITHUB_URL.exec(spec);
    if (gh !== null) return Host.fromRaw({ kind: 'github', owner: gh[1], repository: gh[2], number: Number(gh[3]) });
    const ado = AZURE_URL.exec(spec);
    if (ado !== null) return Host.fromRaw({ kind: 'azure-devops', organization: ado[1], project: ado[2], repository: ado[3], id: Number(ado[4]) });
    const git = GIT_SPEC.exec(spec);
    if (git !== null) return Host.fromRaw({ kind: 'git', repository: resolve(git[1]), base: git[2], head: git[3] });
    return Result.err(`${spec} is not a pull request URL this skill knows, nor a repository@base..head range`);
  }
  kind() {
    return this.#value.toContract().kind;
  }
  match(handlers) {
    if (this.#tag === 'github') return handlers.github(this.#value);
    if (this.#tag === 'azureDevOps') return handlers.azureDevOps(this.#value);
    return handlers.git(this.#value);
  }
  toContract() {
    return this.#value.toContract();
  }
}

export class PullRequest {
  #host;
  #author;
  #description;
  constructor(guard, host, author, description) {
    if (guard !== prToken) throw new Error('Use PullRequest.fromRaw to construct PullRequest');
    this.#host = host;
    this.#author = author;
    this.#description = description;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(pullRequestSchema, raw, (v) => v).flatMap((v) =>
      Host.fromRaw(v.host).flatMap((host) =>
        Identifier.fromRaw(v.author).map((author) => new PullRequest(prToken, host, author, v.description)),
      ),
    );
  }
  host() {
    return this.#host;
  }
  author() {
    return this.#author;
  }
  description() {
    return this.#description;
  }
  toContract() {
    return { host: this.#host.toContract(), author: this.#author.toContract(), description: this.#description };
  }
}
