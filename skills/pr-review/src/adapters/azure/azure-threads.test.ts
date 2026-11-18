import assert from "node:assert/strict";
import { test as it } from "node:test";
import { SITE } from "../../domain/rulebook.ts";
import {
	isOurThread,
	onLines,
	priorOf,
	refusedOf,
	staleRefusals,
	thread,
	unposted,
} from "./azure-threads.ts";

const SHA1_HEX_LENGTH = 40;
const REFUSAL_THREAD_ID = 9;
const SHA_A = "a".repeat(SHA1_HEX_LENGTH);
const SHA_B = "b".repeat(SHA1_HEX_LENGTH);
const SHA_C = "c".repeat(SHA1_HEX_LENGTH);

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
	assert.equal(
		refusedOf([refusal(REFUSAL_THREAD_ID, "active")], SHA_A),
		String(REFUSAL_THREAD_ID),
	);
	assert.equal(refusedOf([refusal(REFUSAL_THREAD_ID, "active")], SHA_B), null);
	assert.deepEqual(
		staleRefusals([refusal(1, "active"), refusal(2, "fixed"), summary(SHA_B)]),
		["1"],
	);
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
