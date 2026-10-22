import { z } from 'zod';
import { SCHEMAS } from '../.generated/contracts.mjs';
import { CommitSha, NonEmptyText } from './primitives.mjs';
import { PullRequest } from './pull-request.mjs';
import { Result } from './result.mjs';
import { Surface } from './surface.mjs';

const reviewSchema = z.fromJSONSchema(SCHEMAS['review.schema.json']);
const token = Symbol('Review');

export class Review {
  #pullRequest;
  #headCommit;
  #files;
  #ledger;
  #report;
  constructor(guard, pullRequest, headCommit, files, ledger, report) {
    if (guard !== token) throw new Error('Use Review.fromRaw to construct Review');
    this.#pullRequest = pullRequest;
    this.#headCommit = headCommit;
    this.#files = Object.freeze([...files]);
    this.#ledger = ledger;
    this.#report = report;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(reviewSchema, raw, (v) => v).flatMap((v) =>
      PullRequest.fromRaw(v.pullRequest).flatMap((pullRequest) =>
        CommitSha.fromRaw(v.headCommit).flatMap((headCommit) =>
          Result.collect(v.files.map((f) => Surface.fromRaw(f))).flatMap((files) =>
            NonEmptyText.fromRaw(v.ledger).flatMap((ledger) =>
              NonEmptyText.fromRaw(v.report).map(
                (report) => new Review(token, pullRequest, headCommit, files, ledger, report),
              ),
            ),
          ),
        ),
      ),
    );
  }
  pullRequest() {
    return this.#pullRequest;
  }
  headCommit() {
    return this.#headCommit;
  }
  files() {
    return this.#files;
  }
  ledger() {
    return this.#ledger;
  }
  report() {
    return this.#report;
  }
  containsSurfaceSlice(path, side, numberedLines) {
    const file = this.#files.find((candidate) => candidate.path().equals(path));
    if (file === undefined) return false;
    return file.containsAnchorSlice(side, numberedLines);
  }
  toContract() {
    return {
      pullRequest: this.#pullRequest.toContract(),
      headCommit: this.#headCommit.toContract(),
      files: this.#files.map((f) => f.toContract()),
      ledger: this.#ledger.toContract(),
      report: this.#report.toContract(),
    };
  }
}
