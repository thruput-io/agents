import { z } from "zod";
import type { AccessToken } from "./access-token.ts";
import { AzureMergeRequest } from "./azure-merge-request.ts";
import {
	type CodeUnderReview,
	GithubPullRequest,
} from "./code-under-review.ts";
import { GitDiff } from "./git-diff.ts";
import { TargetSchema } from "./host.ts";

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
