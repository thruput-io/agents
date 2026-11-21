import assert from "node:assert/strict";
import { test as it } from "node:test";
import { GithubPullRequest } from "./code-under-review.ts";
import { rendered } from "./outcome.ts";

it("GithubPullRequest exposes its host, surface, fragments, and threads", () => {
	const pr = GithubPullRequest.from({
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	});
	assert.equal(pr.success, true);
	assert.deepEqual(pr.data.host(), {
		kind: "github",
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	});
	assert.deepEqual(pr.data.surface(), []);
	assert.deepEqual(pr.data.fragments(), []);
	assert.deepEqual(pr.data.threads(), { threads: [] });
});

it("rendered writes the review as markdown with summary, inline findings, and ledger", () => {
	const outcome = {
		headCommit: "h",
		verdict: "request-changes" as const,
		summary: "s",
		inline: [
			{
				path: "p",
				side: "head" as const,
				lines: { start: 3, end: 4 },
				body: "r",
			},
		],
		settle: [],
		reopen: [],
	};
	assert.equal(
		rendered(outcome, "| t |"),
		"s\n\n- `p:3-4` (head): r\n\n| t |\n",
	);
	assert.equal(rendered({ ...outcome, inline: [] }, "| t |"), "s\n\n| t |\n");
});
