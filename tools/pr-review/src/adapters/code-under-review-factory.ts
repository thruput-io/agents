import { z } from "zod";
import type { AccessToken } from "../domain/access-token.ts";
import {
	type CodeUnderReview,
	GithubPullRequest,
} from "../domain/code-under-review.ts";
import { TargetSchema } from "../domain/host.ts";
import { AzureMergeRequest } from "./azure/azure-merge-request.ts";
import { GitDiff } from "./git/git-diff.ts";

const HostReviewSchema = z.union([
	GithubPullRequest.SCHEMA,
	AzureMergeRequest.SCHEMA,
	GitDiff.SCHEMA,
]);
const FactorySchema = TargetSchema.pipe(HostReviewSchema);

export class CodeUnderReviewFactory {
	private constructor() {}
	static from(url: string): z.ZodSafeParseResult<CodeUnderReview> {
		return FactorySchema.safeDecode(url);
	}
	static fromWithToken(
		url: string,
		_token: AccessToken,
	): z.ZodSafeParseResult<CodeUnderReview> {
		return FactorySchema.safeDecode(url);
	}
}
