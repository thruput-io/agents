import { z } from "zod";
import { parseJwtScopes } from "./jwt-scopes.ts";
import {
	type AccessTokenKind,
	senseToken,
	TOKEN_BEHAVIORS,
	type TokenBehavior,
} from "./token-behavior.ts";

const SCHEME_ONLY = /^(?:bearer|basic)$/iu;

const TokenSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => !SCHEME_ONLY.test(value));

export class AccessToken {
	readonly #behavior: TokenBehavior;
	readonly #credential: string;
	private constructor(kind: AccessTokenKind, credential: string) {
		this.#behavior = TOKEN_BEHAVIORS[kind];
		this.#credential = credential;
	}
	static from(raw: string): z.ZodSafeParseResult<AccessToken> {
		return TokenSchema.transform((value) => {
			const sensed = senseToken(value);
			return new AccessToken(sensed.kind, sensed.credential);
		}).safeDecode(raw);
	}
	kind(): AccessTokenKind {
		return this.#behavior.kind;
	}
	isBearer(): boolean {
		return this.#behavior.kind === "bearer";
	}
	isBasic(): boolean {
		return this.#behavior.kind === "basic";
	}
	isPat(): boolean {
		return this.#behavior.kind === "pat";
	}
	scopes(): readonly string[] | null {
		return parseJwtScopes(this.#credential).granted();
	}
	hasScope(accepted: readonly string[]): boolean {
		return parseJwtScopes(this.#credential).hasScope(accepted);
	}
	toBearer(): AccessToken {
		const next = this.#behavior.toBearer(this.#credential);
		return new AccessToken(next.kind, next.credential);
	}
	toBasic(): AccessToken {
		const next = this.#behavior.toBasic(this.#credential);
		return new AccessToken(next.kind, next.credential);
	}
	forGitHub(): AccessToken {
		const next = this.#behavior.forGitHub(this.#credential);
		return new AccessToken(next.kind, next.credential);
	}
	forAzure(): AccessToken {
		const next = this.#behavior.forAzure(this.#credential);
		return new AccessToken(next.kind, next.credential);
	}
	authGuidance(envVar: string): string {
		return this.#behavior.authGuidance(envVar);
	}
	authorizationHeader(): string {
		return this.#behavior.authHeader(this.#credential);
	}
	requestInit(): {
		readonly headers: Readonly<Record<string, string>>;
	} {
		return this.requestInitWithHeaders({});
	}
	requestInitWithHeaders(headers: Readonly<Record<string, string>>): {
		readonly headers: Readonly<Record<string, string>>;
	} {
		return {
			headers: {
				accept: "application/json",
				...headers,
				authorization: this.authorizationHeader(),
			},
		};
	}
	equals(other: AccessToken): boolean {
		return this.authorizationHeader() === other.authorizationHeader();
	}
}

export type { AccessTokenKind } from "./token-behavior.ts";
