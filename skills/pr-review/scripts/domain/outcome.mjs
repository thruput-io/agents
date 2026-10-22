import { z } from 'zod';
import { DEFS, SCHEMAS } from './contracts.mjs';
import { Ledger } from './ledger.mjs';
import { LineRange } from './line-range.mjs';
import { Side } from './lines.mjs';
import { ChangedPath, CommitSha, NonEmptyText, ThreadId } from './primitives.mjs';
import { Result } from './result.mjs';
import { RULES_SITE_URL } from './rulebook.mjs';

const inlineFindingSchema = z.fromJSONSchema(DEFS['outcome.schema.json#/$defs/InlineFinding']);
const outcomeSchema = z.fromJSONSchema(SCHEMAS['outcome.schema.json']);
const inlineToken = Symbol('InlineFinding');
const outcomeToken = Symbol('Outcome');

function isThreadCarriedByFindings(thread, findings) {
  return findings.some((finding) =>
    finding.violation.anchor().match({
      surface: ({ path, lines }) =>
        thread.carriesFinding(path, lines.range().end(), finding.citation),
      pullRequest: () => false,
    }),
  );
}

function collectEntryFindings(entries, threads) {
  return Result.collect(
    entries.flatMap(({ instructions, ledger }) =>
      ledger
        .rows()
        .filter((row) => row.isViolation())
        .map((row) =>
          row.citation(instructions).map((citation) =>
            row.violations().map((violation) => ({
              violation,
              citation,
              body: violation.renderBody(citation),
              carried: violation.isAlreadyOpen(citation, threads),
            })),
          ),
        ),
    ),
  ).map((nested) => nested.flat());
}

export class InlineFinding {
  #path;
  #side;
  #lines;
  #body;
  constructor(guard, path, side, lines, body) {
    if (guard !== inlineToken) throw new Error('Use InlineFinding.fromRaw to construct InlineFinding');
    this.#path = path;
    this.#side = side;
    this.#lines = lines;
    this.#body = body;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(inlineFindingSchema, raw, (v) => v).flatMap((v) =>
      ChangedPath.fromRaw(v.path).flatMap((path) =>
        Side.fromRaw(v.side).flatMap((side) =>
          LineRange.fromRaw(v.lines).flatMap((lines) =>
            NonEmptyText.fromRaw(v.body).map(
              (body) => new InlineFinding(inlineToken, path, side, lines, body),
            ),
          ),
        ),
      ),
    );
  }
  path() { return this.#path; }
  side() { return this.#side; }
  lines() { return this.#lines; }
  body() { return this.#body; }
  toContract() {
    return {
      path: this.#path.toContract(),
      side: this.#side.toContract(),
      lines: this.#lines.toContract(),
      body: this.#body.toContract(),
    };
  }
}

export class Outcome {
  #headCommit;
  #verdict;
  #summary;
  #inline;
  #settle;
  #reopen;
  constructor(guard, headCommit, verdict, summary, inline, settle, reopen) {
    if (guard !== outcomeToken) throw new Error('Use Outcome.fromRaw to construct Outcome');
    this.#headCommit = headCommit;
    this.#verdict = verdict;
    this.#summary = summary;
    this.#inline = Object.freeze([...inline]);
    this.#settle = Object.freeze([...settle]);
    this.#reopen = Object.freeze([...reopen]);
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(outcomeSchema, raw, (v) => v).flatMap((v) =>
      CommitSha.fromRaw(v.headCommit).flatMap((headCommit) =>
        NonEmptyText.fromRaw(v.summary).flatMap((summary) =>
          Result.collect(v.inline.map((i) => InlineFinding.fromRaw(i))).flatMap((inline) =>
            Result.collect(v.settle.map((id) => ThreadId.fromRaw(id))).flatMap((settle) =>
              Result.collect(v.reopen.map((id) => ThreadId.fromRaw(id))).map(
                (reopen) =>
                  new Outcome(outcomeToken, headCommit, v.verdict, summary, inline, settle, reopen),
              ),
            ),
          ),
        ),
      ),
    );
  }
  static fromVerifiedEntries(entries, threads) {
    return Ledger.mergeAll(entries.map((e) => e.ledger)).flatMap((mergedLedger) =>
      collectEntryFindings(entries, threads).flatMap((findings) => {
        const fresh = findings.filter((f) => !f.carried);
        const inlineRaw = fresh.flatMap((f) =>
          f.violation.anchor().match({
            surface: ({ path, side, lines }) => [
              {
                path: path.toContract(),
                side: side.toContract(),
                lines: lines.range().toContract(),
                body: f.body,
              },
            ],
            pullRequest: () => [],
          }),
        );
        const atPullRequest = fresh.filter((f) => f.violation.anchor().kind() === 'pull-request');
        const decided = mergedLedger.verdict();
        const summary = [
          `**Verdict: ${decided}**`,
          `${mergedLedger.rows().length} rules probed by ${entries.length} probes at ${mergedLedger.headCommit().toContract()} against [the rules](${RULES_SITE_URL}): ${findings.length} violations, ${inlineRaw.length} inline, ${atPullRequest.length} at the pull request, ${findings.length - fresh.length} already carried by a thread.`,
          ...atPullRequest.map((f) => f.body),
        ].join('\n\n');
        const settle = threads
          .openThreads()
          .filter((t) => !isThreadCarriedByFindings(t, findings))
          .map((t) => t.id().toContract());
        const reopen = threads
          .resolvedByAuthorThreads()
          .filter((t) => isThreadCarriedByFindings(t, findings))
          .map((t) => t.id().toContract());
        return Outcome.fromRaw({
          headCommit: mergedLedger.headCommit().toContract(),
          verdict: decided,
          summary,
          inline: inlineRaw,
          settle,
          reopen,
        }).map((outcome) => Object.freeze({ outcome, mergedLedger }));
      }),
    );
  }
  headCommit() { return this.#headCommit; }
  verdict() { return this.#verdict; }
  summary() { return this.#summary; }
  inline() { return this.#inline; }
  settle() { return this.#settle; }
  reopen() { return this.#reopen; }
  toContract() {
    return {
      headCommit: this.#headCommit.toContract(),
      verdict: this.#verdict,
      summary: this.#summary.toContract(),
      inline: this.#inline.map((i) => i.toContract()),
      settle: this.#settle.map((id) => id.toContract()),
      reopen: this.#reopen.map((id) => id.toContract()),
    };
  }
}
