import { resolve } from "node:path";
import { z } from "zod";
import {
	type AzureDevOps,
	type AzureDevOpsKind,
	AzureDevOpsKindSchema,
	type Git,
	type GitHub,
	type GitHubKind,
	GitHubKindSchema,
	type GitKind,
	GitKindSchema,
	type Host,
	HostSchema,
	type Organization,
	OrganizationSchema,
	type Owner,
	OwnerSchema,
	type Project,
	ProjectSchema,
	type PullRequestId,
	PullRequestIdSchema,
	type PullRequestNumber,
	PullRequestNumberSchema,
	type Ref,
	RefSchema,
	type Repository,
	type RepositoryPath,
	RepositoryPathSchema,
	RepositorySchema,
} from "./contracts.g.ts";
import { isNullOrEmpty, nonEmptyString } from "./nullish.ts";

const GITHUB = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/u;
const AZURE_DEVOPS =
	/^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/u;
const GIT_RANGE = /^(.+)@([^.]+(?:\.[^.]+)*)\.\.([^.].*)$/u;

const toGitHub = (match: RegExpExecArray): GitHub => {
	const kind: GitHubKind = GitHubKindSchema.decode("github");
	const owner: Owner = OwnerSchema.decode(nonEmptyString(match[1]));
	const repository: Repository = RepositorySchema.decode(
		nonEmptyString(match[2]),
	);
	const number: PullRequestNumber = PullRequestNumberSchema.decode(
		Number(match[3]),
	);
	return { kind, owner, repository, number };
};

const toAzure = (match: RegExpExecArray): AzureDevOps => {
	const kind: AzureDevOpsKind = AzureDevOpsKindSchema.decode("azure-devops");
	const organization: Organization = OrganizationSchema.decode(
		nonEmptyString(match[1]),
	);
	const project: Project = ProjectSchema.decode(nonEmptyString(match[2]));
	const repository: Repository = RepositorySchema.decode(
		nonEmptyString(match[3]),
	);
	const id: PullRequestId = PullRequestIdSchema.decode(Number(match[4]));
	return { kind, organization, project, repository, id };
};

const toGit = (match: RegExpExecArray): Git => {
	const kind: GitKind = GitKindSchema.decode("git");
	const repository: RepositoryPath = RepositoryPathSchema.decode(
		resolve(nonEmptyString(match[1])),
	);
	const base: Ref = RefSchema.decode(nonEmptyString(match[2]));
	const head: Ref = RefSchema.decode(nonEmptyString(match[3]));
	return { kind, repository, base, head };
};

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
