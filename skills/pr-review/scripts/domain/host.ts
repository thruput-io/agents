import { resolve } from 'node:path';
import { z } from 'zod';
import { HostSchema } from './contracts.g.ts';

const GITHUB = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
const AZURE_DEVOPS = /^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/;
const GIT_RANGE = /^(.+)@([^.]+(?:\.[^.]+)*)\.\.([^.].*)$/;

export const TargetSchema = z.string().transform((target, ctx): unknown => {
  const github = GITHUB.exec(target);
  if (github !== null) return { kind: 'github', owner: github[1], repository: github[2], number: Number(github[3]) };
  const azure = AZURE_DEVOPS.exec(target);
  if (azure !== null) return { kind: 'azure-devops', organization: azure[1], project: azure[2], repository: azure[3], id: Number(azure[4]) };
  const range = GIT_RANGE.exec(target);
  if (range !== null) return { kind: 'git', repository: resolve(range[1] ?? ''), base: range[2], head: range[3] };
  ctx.addIssue({ code: 'custom', message: `${target} is not a pull request URL this skill knows, nor a repository@base..head range` });
  return z.NEVER;
}).pipe(HostSchema);
