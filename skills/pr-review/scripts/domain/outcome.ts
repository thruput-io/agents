import type {
	InlineFinding,
	Ledger,
	LineRange,
	Outcome,
	Path,
	Summary,
	SurfaceFile,
	ThreadBody,
	ThreadId,
	ThreadState,
	Violation,
} from "./contracts.g.ts";
import { resolveSurfaceLine } from "./ledger.ts";
import { merge, verdict } from "./ledger-table.ts";
import { isNullOrEmpty } from "./nullish.ts";
import { type CitationDocument, citation, message, SITE } from "./rulebook.ts";

interface ThreadCandidate {
	readonly path: Path;
	readonly lines: LineRange;
	readonly body: ThreadBody;
}

interface SurfaceCarrier {
	readonly surface?: { readonly files: readonly SurfaceFile[] };
	readonly review?: { readonly files: readonly SurfaceFile[] };
}

const filesOf = (document: SurfaceCarrier): readonly SurfaceFile[] =>
	document.surface?.files ?? document.review?.files ?? [];

export function alreadyOpen(
	violation: Violation,
	cite: string,
	threads: readonly ThreadCandidate[],
	files: readonly SurfaceFile[],
): boolean {
	const resolved = resolveSurfaceLine(violation.idToReportViolationOn, files);
	return (
		!isNullOrEmpty(resolved) &&
		threads.some(
			(thread) =>
				thread.path === resolved.path &&
				thread.lines.start <= resolved.line &&
				resolved.line <= thread.lines.end &&
				thread.body.includes(cite),
		)
	);
}

interface OutcomeEntry {
	readonly document: CitationDocument & SurfaceCarrier;
	readonly ledger: Ledger;
}

export function settled<ThreadItem extends ThreadCandidate>(
	entries: readonly OutcomeEntry[],
	threads: readonly ThreadItem[],
): ThreadItem[] {
	const carried = new Set<ThreadItem>();
	for (const { document, ledger } of entries) {
		const files = filesOf(document);
		for (const row of ledger.rows) {
			if (row.verdict !== "violation") {
				continue;
			}
			const cite = citation(document, row);
			for (const violation of row.violations) {
				for (const thread of threads.filter((candidate) =>
					alreadyOpen(violation, cite, [candidate], files),
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
	const findings = entries.flatMap(({ document, ledger: ownLedger }) => {
		const files = filesOf(document);
		return ownLedger.rows.flatMap((row) =>
			row.verdict === "violation"
				? row.violations.map((violation) => ({
						resolved: resolveSurfaceLine(
							violation.idToReportViolationOn,
							files,
						),
						body: message(violation, citation(document, row)),
						carried: alreadyOpen(
							violation,
							citation(document, row),
							unsettledThreads,
							files,
						),
					}))
				: [],
		);
	});
	const fresh = findings.filter((finding) => !finding.carried);
	const inline: InlineFinding[] = fresh.flatMap(({ resolved, body }) =>
		isNullOrEmpty(resolved)
			? []
			: [
					{
						path: resolved.path,
						side: resolved.side,
						lines: { start: resolved.line, end: resolved.line },
						body,
					},
				],
	);
	const atPullRequest = fresh.filter((finding) =>
		isNullOrEmpty(finding.resolved),
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
