import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	AzureEvaluationsListCodec,
	AzurePullRequestCodec,
	headCommitOf,
} from "./azure.ts";
import {
	AzureInlineThreadCodec,
	AzureTextThreadCodec,
	AzureThreadStatusCodec,
	AzureVoteCodec,
} from "./azure-review.ts";
import { AzureThreadCodec, AzureThreadsListCodec } from "./azure-threads.ts";
import { SITE } from "./rulebook.ts";

const SHA1_HEX_LENGTH = 40;
const SHA_A = "a".repeat(SHA1_HEX_LENGTH);
const SAMPLE_THREAD_ID = 42;

it("Azure thread and vote codecs encode adapter models into validated wire payloads and decode wire payloads", () => {
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
		id: SAMPLE_THREAD_ID,
		status: "active",
		threadContext: wireInline.threadContext ?? null,
		comments: wireInline.comments ?? null,
	});
	assert.equal(domainThread.id, String(SAMPLE_THREAD_ID));
	assert.equal(domainThread.path, "service.ts");
	assert.equal(AzureThreadCodec.encode(domainThread).id, SAMPLE_THREAD_ID);
});

it("Azure list and pull request codecs encode and decode wire payloads", () => {
	const decodedThreads = AzureThreadsListCodec.decode({
		count: 1,
		value: [
			{ id: SAMPLE_THREAD_ID, status: "active", comments: [{ content: "hi" }] },
		],
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
