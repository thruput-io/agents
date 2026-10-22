import { z } from 'zod';
import { DEFS, SCHEMAS } from '../.generated/contracts.mjs';
import { NumberedLines, Side } from './lines.mjs';
import { ChangedPath, NonEmptyText } from './primitives.mjs';
import { Result } from './result.mjs';

const anchorSchema = z.fromJSONSchema(DEFS['violation.schema.json#/$defs/Anchor']);
const violationSchema = z.fromJSONSchema(SCHEMAS['violation.schema.json']);
const anchorToken = Symbol('Anchor');
const violationToken = Symbol('Violation');

export class Anchor {
  #kind;
  #surface;
  constructor(guard, kind, surface) {
    if (guard !== anchorToken) throw new Error('Use Anchor.fromRaw to construct Anchor');
    this.#kind = kind;
    this.#surface = surface !== null ? Object.freeze({ ...surface }) : null;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(anchorSchema, raw, (v) => v).flatMap((v) => {
      if (v.kind === 'pull-request') {
        return Result.ok(new Anchor(anchorToken, 'pull-request', null));
      }
      return ChangedPath.fromRaw(v.path).flatMap((path) =>
        Side.fromRaw(v.side).flatMap((side) =>
          NumberedLines.fromRaw(v.lines).map(
            (lines) => new Anchor(anchorToken, 'surface', { path, side, lines }),
          ),
        ),
      );
    });
  }
  kind() {
    return this.#kind;
  }
  match(handlers) {
    return this.#kind === 'surface' ? handlers.surface(this.#surface) : handlers.pullRequest();
  }
  isInsideReview(review) {
    return this.match({
      surface: ({ path, side, lines }) => review.containsSurfaceSlice(path, side, lines),
      pullRequest: () => true,
    });
  }
  toContract() {
    return this.match({
      surface: ({ path, side, lines }) => ({
        kind: 'surface',
        path: path.toContract(),
        side: side.toContract(),
        lines: lines.toContract(),
      }),
      pullRequest: () => ({ kind: 'pull-request' }),
    });
  }
}

export class Violation {
  #observation;
  #anchor;
  constructor(guard, observation, anchor) {
    if (guard !== violationToken) throw new Error('Use Violation.fromRaw to construct Violation');
    this.#observation = observation;
    this.#anchor = anchor;
    Object.freeze(this);
  }
  static fromRaw(raw) {
    return Result.fromZod(violationSchema, raw, (v) => v).flatMap((v) =>
      NonEmptyText.fromRaw(v.observation).flatMap((observation) =>
        Anchor.fromRaw(v.anchor).map(
          (anchor) => new Violation(violationToken, observation, anchor),
        ),
      ),
    );
  }
  observation() {
    return this.#observation;
  }
  anchor() {
    return this.#anchor;
  }
  isInsideReview(review) {
    return this.#anchor.isInsideReview(review);
  }
  renderBody(citation) {
    return `${this.#observation.toContract()} breaks ${citation}`;
  }
  isAlreadyOpen(citation, threads) {
    return this.#anchor.match({
      surface: ({ path, lines }) =>
        threads.anyCarriesFinding(path, lines.range().end(), citation),
      pullRequest: () => false,
    });
  }
  toContract() {
    return {
      observation: this.#observation.toContract(),
      anchor: this.#anchor.toContract(),
    };
  }
}
