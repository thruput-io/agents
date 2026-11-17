import {
	pullsListFiles,
	pullsListReviews,
	reposDownloadZipballArchive,
} from "../../clients/github.g.ts";
import {
	type AdapterResolution,
	buildBinaryHostError,
	type HostHttpResponse,
	type HostTransport,
	isBinaryResponse,
	isJsonResponse,
} from "./adapter.ts";
import type { GitHub, HeadCommit, HostError, Summary } from "./contracts.g.ts";
import {
	GitHubPullFilesCodec,
	GitHubReviewsCodec,
	postedAt,
	refusedIn,
} from "./github.ts";
import {
	DIFF_LIMIT_EXCEEDED,
	type FileLineCount,
	MAX_ADDED_LINES,
	MAX_CHANGED_FILES,
	MAX_DIFF_LINES,
	oversizedFiles,
	tooLarge,
} from "./limits.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { CommitZipArchive } from "./snapshot-directory.ts";

const PULL_FILES_PER_PAGE = 100;
const MAX_PULL_FILE_PAGES = 3;

export interface GitHubPullCounts {
	readonly additions: number;
	readonly deletions: number;
	readonly changed_files: number;
}

export const exceedsPullCounts = (pr: GitHubPullCounts): boolean =>
	pr.changed_files > MAX_CHANGED_FILES ||
	pr.additions > MAX_ADDED_LINES ||
	pr.additions + pr.deletions > MAX_DIFF_LINES;

const listPullFiles = async (input: {
	readonly host: GitHub;
	readonly init: RequestInit;
	readonly onError: (error: HostHttpResponse) => HostError;
}): Promise<FileLineCount[] | HostError> => {
	const { host, init, onError } = input;
	const fileCounts: FileLineCount[] = [];
	for (let page = 1; page <= MAX_PULL_FILE_PAGES; page += 1) {
		const filesRes = await pullsListFiles(
			host.owner,
			host.repository,
			host.number,
			{ per_page: PULL_FILES_PER_PAGE, page },
			init,
		);
		if (!isJsonResponse(filesRes)) {
			return onError(filesRes);
		}
		const pageFiles = GitHubPullFilesCodec.decode(filesRes.data);
		for (const file of pageFiles) {
			fileCounts.push({
				path: file.filename,
				lines: file.additions,
				added: file.additions,
				deleted: file.deletions,
			});
		}
		if (pageFiles.length < PULL_FILES_PER_PAGE) {
			break;
		}
	}
	return fileCounts;
};

export const resolveOversizedGitHubPull = async (input: {
	readonly host: GitHub;
	readonly pr: GitHubPullCounts;
	readonly headCommit: HeadCommit;
	readonly init: RequestInit;
	readonly onError: (error: HostHttpResponse) => HostError;
	readonly refuseLocation: (
		commit: HeadCommit,
		existingRefusal: Summary | null,
		reason: Summary,
	) => Promise<Summary | HostError>;
}): Promise<AdapterResolution> => {
	const { host, pr, headCommit, init, onError, refuseLocation } = input;
	const [reviewsRes, fileCounts] = await Promise.all([
		pullsListReviews(host.owner, host.repository, host.number, {}, init),
		listPullFiles({ host, init, onError }),
	]);
	if (!isJsonResponse(reviewsRes)) {
		return onError(reviewsRes);
	}
	if (!Array.isArray(fileCounts)) {
		return fileCounts;
	}
	const reviews = GitHubReviewsCodec.decode(reviewsRes.data);
	const already = postedAt(reviews, headCommit);
	if (!isNullOrEmpty(already)) {
		return { kind: "already-reviewed", headCommit, location: already };
	}
	const finalReasons = [...tooLarge(fileCounts)];
	if (finalReasons.length === 0 && exceedsPullCounts(pr)) {
		finalReasons.push(DIFF_LIMIT_EXCEEDED);
	}
	const location = await refuseLocation(
		headCommit,
		refusedIn(reviews, headCommit),
		finalReasons.join(", "),
	);
	if (typeof location !== "string") {
		return location;
	}
	let files = oversizedFiles(fileCounts);
	if (files.length === 0) {
		files = fileCounts.map((entry) => entry.path);
	}
	return {
		kind: "too-large",
		headCommit,
		files,
		location,
	};
};

export const downloadGitHubCommitZips = async (input: {
	readonly host: GitHub;
	readonly commits: readonly string[];
	readonly init: RequestInit;
	readonly token: HostTransport;
}): Promise<CommitZipArchive[] | HostError> => {
	const { host, commits, init, token } = input;
	const zipResponses = await Promise.all(
		commits.map(async (sha) => ({
			sha,
			res: await reposDownloadZipballArchive(
				host.owner,
				host.repository,
				sha,
				init,
			),
		})),
	);
	const failedZip = zipResponses.find(({ res }) => !isBinaryResponse(res));
	if (!isNullOrEmpty(failedZip)) {
		return buildBinaryHostError(host, failedZip.res, token);
	}
	return zipResponses.map(({ sha, res }) => ({
		sha,
		zip: res.data,
	}));
};
