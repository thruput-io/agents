import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	artifactIdOf,
	blockingBuildPolicies,
	changeOf,
	headCommitOf,
	KIND,
	refusalReasons,
	remoteUrlOf,
} from "./azure.ts";
import {
	refusalText,
	text,
	threadPayload,
	votePayload,
} from "./azure-review.ts";
import {
	isOurThread,
	onLines,
	priorOf,
	refusedOf,
	staleRefusals,
	thread,
	unposted,
} from "./azure-threads.ts";
import { SITE } from "./rulebook.ts";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const HOST = {
	kind: KIND,
	organization: "org",
	project: "proj",
	repository: "repo",
	id: 42,
};

it("headCommitOf, changeOf, artifactIdOf, and remoteUrlOf fold an Azure GitPullRequest into domain contracts", () => {
	const pr = {
		lastMergeSourceCommit: { commitId: SHA_A },
		createdBy: { uniqueName: "me@example.com" },
		repository: {},
	};
	assert.equal(headCommitOf(pr), SHA_A);
	assert.deepEqual(changeOf(HOST, pr), {
		host: HOST,
		author: "me@example.com",
		description: "",
	});
	assert.equal(
		artifactIdOf(HOST, pr),
		"vstfs:///CodeReview/CodeReviewId/proj/42",
	);
	assert.equal(
		remoteUrlOf(HOST, pr),
		"https://dev.azure.com/org/proj/_git/repo",
	);
});

it("blockingBuildPolicies and refusalReasons keep only blocking Build policies and merge conflicts", () => {
	const policy = (
		status: "approved" | "rejected",
		isBlocking: boolean,
		displayName: string,
	) => ({
		status,
		configuration: { isBlocking, type: { displayName } },
	});
	const kept = blockingBuildPolicies([
		policy("rejected", true, "Build"),
		policy("approved", true, "Build"),
		policy("rejected", false, "Build"),
		policy("rejected", true, "Reviewers"),
	]);
	assert.deepEqual(
		kept.map((item) => item.status),
		["rejected", "approved"],
	);
	assert.deepEqual(refusalReasons("conflicts", kept), [
		"pull request has merge conflicts",
		"the blocking Build policy is rejected",
	]);
});

it("thread folds an Azure DevOps thread into side, lines, and state, while onLines and isOurThread filter threads", () => {
	const cited = `Unused export breaks [Simplicity](${SITE}#simplicity)`;
	const right = {
		id: 7,
		status: "active" as const,
		threadContext: {
			filePath: "/a.cs",
			rightFileStart: { line: 8 },
			rightFileEnd: { line: 9 },
		},
		comments: [{ content: cited }],
	};
	const left = {
		id: 8,
		status: "fixed" as const,
		threadContext: {
			filePath: "/a.cs",
			leftFileEnd: { line: 2 },
		},
		comments: [{ content: cited }],
	};
	assert.equal(onLines(right), true);
	assert.equal(isOurThread(right), true);
	assert.equal(
		isOurThread({ comments: [{ content: "human comment" }] }),
		false,
	);
	assert.deepEqual(thread(right), {
		id: "7",
		path: "a.cs",
		side: "head",
		lines: { start: 8, end: 9 },
		state: "open",
		body: cited,
	});
	assert.deepEqual(thread(left), {
		id: "8",
		path: "a.cs",
		side: "base",
		lines: { start: 2, end: 2 },
		state: "resolved-by-author",
		body: cited,
	});
	assert.equal(thread({ ...left, status: "closed" }).state, "resolved");
});

it("priorOf, refusedOf, and staleRefusals inspect pull-request-level threads", () => {
	const summary = (sha: string) => ({
		id: 1,
		status: "active" as const,
		comments: [
			{
				content: `**Verdict: approve**\n\n3 rules probed by 2 probes at ${sha} against [the rules](${SITE}): 0 violations`,
			},
		],
	});
	const noise = {
		id: 2,
		comments: [{ content: "Policy status has been updated" }],
	};
	assert.equal(priorOf([noise, summary(SHA_A), summary(SHA_B)]), SHA_B);
	assert.equal(priorOf([noise]), null);
	assert.equal(
		priorOf([
			{
				id: 3,
				status: "active" as const,
				comments: [
					{
						content: `77 rules probed by 22 probes at ${SHA_C}: 51 violations ... breaks [P](${SITE}#p)`,
					},
				],
			},
		]),
		SHA_C,
	);

	const refusal = (id: number, status: "active" | "fixed") => ({
		id,
		status,
		comments: [
			{
				content: `**Verdict: request-changes**\n\nNot reviewed at ${SHA_A} against [the rules](${SITE}): the blocking Build policy is running.`,
			},
		],
	});
	assert.equal(refusedOf([refusal(9, "active")], SHA_A), "9");
	assert.equal(refusedOf([refusal(9, "active")], SHA_B), null);
	assert.deepEqual(
		staleRefusals([refusal(1, "active"), refusal(2, "fixed"), summary(SHA_B)]),
		["1"],
	);
});

it("text, threadPayload, refusalText, and votePayload transform domain contracts into Azure DevOps payloads", () => {
	assert.deepEqual(text("c"), {
		comments: [{ parentCommentId: 0, commentType: "text", content: "c" }],
		status: "active",
	});
	assert.deepEqual(
		threadPayload({
			path: "p",
			side: "head",
			lines: { start: 3, end: 3 },
			body: "r",
		}),
		{
			...text("r"),
			threadContext: {
				filePath: "/p",
				rightFileStart: { line: 3, offset: 1 },
				rightFileEnd: { line: 3, offset: 1 },
			},
		},
	);
	assert.deepEqual(
		threadPayload({
			path: "p",
			side: "base",
			lines: { start: 1, end: 4 },
			body: "r",
		}).threadContext,
		{
			filePath: "/p",
			leftFileStart: { line: 1, offset: 1 },
			leftFileEnd: { line: 4, offset: 1 },
		},
	);
	assert.equal(
		refusalText(SHA_A, "policy rejected").comments?.[0]?.content?.includes(
			`Not reviewed at ${SHA_A}`,
		),
		true,
	);
	assert.deepEqual(votePayload("approve"), { vote: 10 });
	assert.deepEqual(votePayload("request-changes"), { vote: -10 });
});

it("unposted keeps only inline findings and summary not yet carried on the pull request", () => {
	const cited = `r breaks [P](${SITE}#p)`;
	const carried = {
		id: 11,
		status: "active" as const,
		threadContext: {
			filePath: "/p",
			rightFileStart: { line: 3 },
			rightFileEnd: { line: 3 },
		},
		comments: [{ content: cited }],
	};
	const summary = {
		id: 12,
		status: "active" as const,
		comments: [
			{
				content: `**Verdict: request-changes**\n\n3 rules probed by 2 probes at ${SHA_A} against [the rules](${SITE}): 1 violations\n\n| t |`,
			},
		],
	};
	const outcome = {
		headCommit: SHA_A,
		verdict: "request-changes" as const,
		summary: `**Verdict: request-changes**\n\n3 rules probed by 2 probes at ${SHA_A} against [the rules](${SITE}): 1 violations`,
		inline: [
			{
				path: "p",
				side: "head" as const,
				lines: { start: 3, end: 3 },
				body: cited,
			},
			{
				path: "q",
				side: "head" as const,
				lines: { start: 5, end: 5 },
				body: "s",
			},
		],
		settle: ["11", "99"],
		reopen: [],
	};
	const left = unposted(outcome, [carried, summary]);
	assert.deepEqual(
		left.inline.map((finding) => finding.path),
		["q"],
	);
	assert.equal(left.summary, false);
	assert.deepEqual(left.settle, ["11"]);
	const all = unposted(outcome, []);
	assert.equal(all.inline.length, 2);
	assert.equal(all.summary, true);
	assert.deepEqual(all.settle, []);
});
