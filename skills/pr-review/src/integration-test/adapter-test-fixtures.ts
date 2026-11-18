import type { Ledger, Outcome } from "../domain/contracts.g.ts";

const sampleOutcome = (headCommit: string): Outcome => ({
	headCommit,
	verdict: "request-changes",
	summary: "Found violation",
	inline: [
		{
			path: "service.ts",
			side: "head",
			lines: { start: 1, end: 1 },
			body: "Issue",
		},
	],
	settle: [],
	reopen: [],
});

const sampleLedger = (headCommit: string): Ledger => ({
	headCommit,
	rows: [],
});

export { sampleLedger, sampleOutcome };
