import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test as it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	AzureEvaluationsListCodec,
	AzurePullRequestCodec,
	artifactIdOf,
	blockingBuildPolicies,
	changeOf,
	headCommitOf,
	KIND,
	refusalReasons,
	remoteUrlOf,
} from "./azure.ts";
import {
	AzureInlineThreadCodec,
	AzureTextThreadCodec,
	AzureThreadStatusCodec,
	AzureVoteCodec,
	refusalText,
	text,
	threadPayload,
	votePayload,
} from "./azure-review.ts";
import {
	AzureThreadCodec,
	AzureThreadsListCodec,
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

const SEQUENTIAL_FOR_AWAIT_RE = /for\s*\([^)]+\)\s*\{\s*await\b/u;

it("AzureDevOpsAdapter.post dispatches thread network requests concurrently via Promise.all with no sequential await-in-for-loop", () => {
	const adapterSource = readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), "azure-adapter.ts"),
		"utf8",
	);
	assert.equal(SEQUENTIAL_FOR_AWAIT_RE.test(adapterSource), false);
});

it("Azure transport codecs encode adapter models into validated wire payloads and decode wire payloads into adapter models", () => {
	const finding = {
		path: "service.ts",
		side: "head" as const,
		lines: { start: 4, end: 6 },
		body: `Unused export breaks [Simplicity](${SITE}#simplicity)`,
	};
	const wireInline = AzureInlineThreadCodec.encode(finding);
	assert.deepEqual(AzureInlineThreadCodec.decode(wireInline), finding);

	const baseFinding = {
		path: "service.ts",
		side: "base" as const,
		lines: { start: 2, end: 3 },
		body: `Removed line breaks [Simplicity](${SITE}#simplicity)`,
	};
	const wireBaseInline = AzureInlineThreadCodec.encode(baseFinding);
	assert.deepEqual(AzureInlineThreadCodec.decode(wireBaseInline), baseFinding);

	const wireText = AzureTextThreadCodec.encode("Summary comment");
	assert.equal(AzureTextThreadCodec.decode(wireText), "Summary comment");

	assert.deepEqual(AzureVoteCodec.encode("approve"), { vote: 10 });
	assert.equal(AzureVoteCodec.decode({ vote: 10 }), "approve");
	assert.equal(AzureVoteCodec.decode({ vote: -10 }), "request-changes");

	assert.deepEqual(AzureThreadStatusCodec.encode("closed"), {
		status: "closed",
	});
	assert.equal(AzureThreadStatusCodec.decode({ status: "active" }), "active");

	const domainThread = AzureThreadCodec.decode({
		id: 42,
		status: "active",
		threadContext: wireInline.threadContext ?? null,
		comments: wireInline.comments ?? null,
	});
	assert.equal(domainThread.id, "42");
	assert.equal(domainThread.path, "service.ts");
	assert.equal(AzureThreadCodec.encode(domainThread).id, 42);

	const decodedThreads = AzureThreadsListCodec.decode({
		count: 1,
		value: [{ id: 42, status: "active", comments: [{ content: "hi" }] }],
	});
	assert.equal(decodedThreads.length, 1);
	assert.equal(AzureThreadsListCodec.encode(decodedThreads).count, 1);
	assert.throws(() =>
		AzureThreadsListCodec.decode([] as unknown as { value: never[] }),
	);

	const decodedPr = AzurePullRequestCodec.decode({
		lastMergeSourceCommit: { commitId: SHA_A },
		createdBy: { uniqueName: "me@example.com" },
		description: "desc",
		mergeStatus: "succeeded",
		targetRefName: "refs/heads/main",
		sourceRefName: "refs/heads/feature",
		repository: {
			remoteUrl: "https://dev.azure.com/org/proj/_git/repo",
			project: { id: "00000000-0000-0000-0000-000000000000" },
		},
	});
	assert.equal(headCommitOf(decodedPr), SHA_A);
	assert.equal(
		AzurePullRequestCodec.encode(decodedPr).lastMergeSourceCommit?.commitId,
		SHA_A,
	);

	const decodedEvals = AzureEvaluationsListCodec.decode({
		count: 1,
		value: [{ status: "approved", configuration: { isBlocking: true } }],
	});
	assert.equal(decodedEvals.length, 1);
	assert.equal(AzureEvaluationsListCodec.encode(decodedEvals).count, 1);
	assert.throws(() =>
		AzureEvaluationsListCodec.decode([] as unknown as { value: never[] }),
	);
});
