import type {
	InlineFinding,
	Ledger,
	LineRange,
	Outcome,
	Path,
	PullRequestAnchor,
	Summary,
	ThreadBody,
	ThreadId,
	ThreadState,
	Violation,
} from "./contracts.g.ts";
import { span } from "./fragments.ts";
import { merge, verdict } from "./ledger-table.ts";
import { type CitationDocument, citation, message, SITE } from "./rulebook.ts";

interface ThreadCandidate {
	readonly path: Path;
	readonly lines: LineRange;
	readonly body: ThreadBody;
}

export function alreadyOpen(
	violation: Violation,
	cite: string,
	threads: readonly ThreadCandidate[],
): boolean {
	const { anchor } = violation;
	return (
		anchor.kind !== "pull-request" &&
		threads.some(
			(thread) =>
				thread.path === anchor.path &&
				thread.lines.end === span(anchor.lines).end &&
				thread.body.includes(cite),
		)
	);
}

interface OutcomeEntry {
	readonly document: CitationDocument;
	readonly ledger: Ledger;
}

export function settled<ThreadItem extends ThreadCandidate>(
	entries: readonly OutcomeEntry[],
	threads: readonly ThreadItem[],
): ThreadItem[] {
	const carried = new Set<ThreadItem>();
	for (const { document, ledger } of entries) {
		for (const row of ledger.rows) {
			if (row.verdict !== "violation") {
				continue;
			}
			const cite = citation(document, row);
			for (const violation of row.violations) {
				for (const thread of threads.filter((candidate) =>
					alreadyOpen(violation, cite, [candidate]),
				)) {
					carried.add(thread);
				}
			}
		}
	}
	return threads.filter((thread) => !carried.has(thread));
}

export function outcome<
	ThreadItem extends ThreadCandidate & {
		readonly id: ThreadId;
		readonly state: ThreadState;
	},
>(entries: readonly OutcomeEntry[], threads: readonly ThreadItem[]): Outcome {
	const ledger = merge(entries.map((entry) => entry.ledger));
	const unsettledThreads = threads.filter(
		(thread) => thread.state !== "resolved",
	);
	const findings = entries.flatMap(({ document, ledger: ownLedger }) =>
		ownLedger.rows.flatMap((row) =>
			row.verdict === "violation"
				? row.violations.map((violation) => ({
						...violation,
						body: message(violation, citation(document, row)),
						carried: alreadyOpen(
							violation,
							citation(document, row),
							unsettledThreads,
						),
					}))
				: [],
		),
	);
	const fresh = findings.filter((finding) => !finding.carried);
	const inline: InlineFinding[] = fresh.flatMap(({ anchor, body }) =>
		anchor.kind === "surface"
			? [
					{
						path: anchor.path,
						side: anchor.side,
						lines: span(anchor.lines),
						body,
					},
				]
			: [],
	);
	const atPullRequest = fresh.filter(
		(
			finding,
		): finding is typeof finding & { readonly anchor: PullRequestAnchor } =>
			finding.anchor.kind === "pull-request",
	);
	const decided = verdict(ledger);
	const summary: Summary = [
		`**Verdict: ${decided}**`,
		`${ledger.rows.length} rules probed by ${entries.length} probes at ${ledger.headCommit} against [the rules](${SITE}): ${findings.length} violations, ${inline.length} inline, ${atPullRequest.length} at the pull request, ${findings.length - fresh.length} already carried by a thread.`,
		...atPullRequest.map((finding) => finding.body),
	].join("\n\n");
	const openThreads = threads.filter((thread) => thread.state === "open");
	const resolvedByAuthor = threads.filter(
		(thread) => thread.state === "resolved-by-author",
	);
	return {
		headCommit: ledger.headCommit,
		verdict: decided,
		summary,
		inline,
		settle: settled(entries, openThreads).map((thread) => thread.id),
		reopen: resolvedByAuthor
			.filter((thread) => settled(entries, [thread]).length === 0)
			.map((thread) => thread.id),
	};
}
