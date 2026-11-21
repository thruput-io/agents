import { resolve } from "node:path";
import { z } from "zod";
import {
	type AzureDevOps,
	AzureDevOpsSchema,
	type Git,
	type GitHub,
	GitHubSchema,
	GitSchema,
	type Host,
	HostSchema,
} from "./contracts.g.ts";
import { isNullOrEmpty, nonEmptyString } from "./nullish.ts";

const GITHUB =
	/^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repository>[^/]+)\/pull\/(?<number>\d+)/u;
const AZURE_DEVOPS =
	/^https:\/\/dev\.azure\.com\/(?<organization>[^/]+)\/(?<project>[^/]+)\/_git\/(?<repository>[^/]+)\/pullrequest\/(?<id>\d+)/u;
const GIT_RANGE =
	/^(?<repository>.+)@(?<base>[^.]+(?:\.[^.]+)*)\.\.(?<head>[^.].*)$/u;

const toGitHub = (match: RegExpExecArray): GitHub =>
	GitHubSchema.parse({
		kind: "github",
		owner: nonEmptyString(match[1]),
		repository: nonEmptyString(match[2]),
		number: Number(match[3]),
	});

const toAzure = (match: RegExpExecArray): AzureDevOps =>
	AzureDevOpsSchema.parse({
		kind: "azure-devops",
		organization: nonEmptyString(match[1]),
		project: nonEmptyString(match[2]),
		repository: nonEmptyString(match[3]),
		id: Number(match[4]),
	});

const toGit = (match: RegExpExecArray): Git =>
	GitSchema.parse({
		kind: "git",
		repository: resolve(nonEmptyString(match[1])),
		base: nonEmptyString(match[2]),
		head: nonEmptyString(match[3]),
	});

export const TargetSchema = z
	.string()
	.transform((target, ctx): Host => {
		const github = GITHUB.exec(target);
		if (!isNullOrEmpty(github)) {
			return toGitHub(github);
		}
		const azure = AZURE_DEVOPS.exec(target);
		if (!isNullOrEmpty(azure)) {
			return toAzure(azure);
		}
		const range = GIT_RANGE.exec(target);
		if (!isNullOrEmpty(range)) {
			return toGit(range);
		}
		ctx.addIssue({
			code: "custom",
			message: `${target} is not a pull request URL this skill knows, nor a repository@base..head range`,
		});
		return z.NEVER;
	})
	.pipe(HostSchema);
