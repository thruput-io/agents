import assert from "node:assert/strict";
import { test as it } from "node:test";
import { SITE } from "../../domain/rulebook.ts";
import { getPullsGetResponseMock } from "../../generated/github/github.g.ts";
import {
	baseCommitOf,
	changeOf,
	failedChecks,
	GitHubPullFilesCodec,
	headCommitOf,
	postedAt,
	priorOf,
	refusalReasons,
	refusedIn,
} from "./github.ts";
import { payload, refusalPayload } from "./github-review.ts";
import { comment } from "./github-review-comment.ts";

const SHA1_HEX_LENGTH = 40;
const SHA_A = "a".repeat(SHA1_HEX_LENGTH);
const SHA_B = "b".repeat(SHA1_HEX_LENGTH);
const START_LINE_KEY = "start_line";
const START_SIDE_KEY = "start_side";
const HTML_URL_KEY = "html_url";
const HOST = {
	kind: "github" as const,
	owner: "octocat",
	repository: "hello-world",
	number: 14,
};

it("changeOf, headCommitOf, and baseCommitOf fold a GitHub PullRequest into domain contracts", () => {
	const basePull = getPullsGetResponseMock({ body: null });
	const pr = {
		...basePull,
		base: {
			...basePull.base,
			sha: SHA_B,
			ref: "main",
		},
		head: {
			...basePull.head,
			sha: SHA_A,
			ref: "feature",
			repo: null,
		},
		user: { ...basePull.user, login: "author" },
		body: null,
	};
	assert.equal(headCommitOf(pr), SHA_A);
	assert.equal(baseCommitOf(pr), SHA_B);
	assert.deepEqual(changeOf(HOST, pr), {
		host: HOST,
		author: "author",
		description: "",
	});
	assert.throws(() => headCommitOf({ head: { sha: "not-a-sha" } }));
	assert.throws(() => baseCommitOf({ base: { sha: "not-a-sha" } }));
	const encodedFiles = GitHubPullFilesCodec.encode([
		{ path: "src/a.ts", lines: 12, added: 12, deleted: 3 },
	]);
	assert.deepEqual(GitHubPullFilesCodec.decode(encodedFiles), [
		{ path: "src/a.ts", lines: 12, added: 12, deleted: 3 },
	]);
});

it("failedChecks and refusalReasons report non-passing checks and merge conflicts", () => {
	const failed = failedChecks([
		{ name: "build", conclusion: "success" },
		{ name: "lint", conclusion: "failure" },
		{ name: "docs", conclusion: "skipped" },
		{ name: "queued", conclusion: null },
	]);
	assert.deepEqual(failed, [
		"check lint did not succeed",
		"check queued did not succeed",
	]);
	assert.deepEqual(refusalReasons("dirty", failed), [
		"pull request has merge conflicts",
		"check lint did not succeed",
		"check queued did not succeed",
	]);
	assert.deepEqual(refusalReasons("clean", []), []);
});

it("comment transforms domain inline findings into GitHub review comments", () => {
	const one = {
		path: "p",
		side: "head" as const,
		lines: { start: 3, end: 3 },
		body: "r",
	};
	const range = {
		path: "q",
		side: "base" as const,
		lines: { start: 1, end: 4 },
		body: "r",
	};
	assert.deepEqual(comment(one), {
		path: "p",
		line: 3,
		side: "RIGHT",
		body: "r",
	});
	assert.deepEqual(comment(range), {
		path: "q",
		[START_LINE_KEY]: 1,
		[START_SIDE_KEY]: "LEFT",
		line: 4,
		side: "LEFT",
		body: "r",
	});
});

it("payload and refusalPayload transform domain outcomes into GitHub review bodies", () => {
	const one = {
		path: "p",
		side: "head" as const,
		lines: { start: 3, end: 3 },
		body: "r",
	};
	const review = payload(
		{
			headCommit: SHA_A,
			verdict: "request-changes",
			summary: "s",
			inline: [one],
			settle: [],
			reopen: [],
		},
		"| t |",
	);
	assert.equal(review.commit_id, SHA_A);
	assert.equal(review.event, "REQUEST_CHANGES");
	assert.equal(
		review.body,
		[
			"s",
			["<details>", "<summary>Review ledger</summary>"].join("\n"),
			"| t |",
			"</details>",
		].join("\n\n"),
	);
	assert.deepEqual(review.comments, [comment(one)]);
	assert.equal(
		payload(
			{
				headCommit: SHA_A,
				verdict: "approve",
				summary: "s",
				inline: [],
				settle: [],
				reopen: [],
			},
			"",
		).event,
		"APPROVE",
	);
	assert.equal(
		refusalPayload(SHA_A, "check build did not succeed").event,
		"REQUEST_CHANGES",
	);
});

it("refusedIn, postedAt, and priorOf inspect GitHub review records", () => {
	const refusal = {
		state: "CHANGES_REQUESTED",
		[HTML_URL_KEY]: "https://github.com/o/r/pull/1#pullrequestreview-5",
		body: `**Verdict: request-changes**\n\nNot reviewed at ${SHA_A} against [the rules](${SITE}): check build did not succeed.`,
	};
	assert.equal(refusedIn([refusal], SHA_A), refusal.html_url);
	assert.equal(refusedIn([refusal], SHA_B), null);

	const review = {
		state: "CHANGES_REQUESTED",
		[HTML_URL_KEY]: "https://github.com/o/r/pull/1#pullrequestreview-7",
		body: `**Verdict: request-changes**\n\n3 rules probed by 2 probes at ${SHA_A} against [the rules](${SITE}): 1 violations`,
	};
	assert.equal(postedAt([review], SHA_A), review.html_url);
	assert.equal(postedAt([review], SHA_B), null);
	assert.equal(priorOf([refusal, review]), SHA_A);
});
