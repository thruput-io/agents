import { z } from "zod";

export type AccessTokenKind = "bearer" | "basic" | "pat";

const BEARER_PREFIX = /^bearer\s+(\S+)$/iu;
const BASIC_PREFIX = /^basic\s+(\S+)$/iu;
const SCHEME_ONLY = /^(?:bearer|basic)$/iu;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const GITHUB_TOKEN_PATTERN = /^(?:gh[pousr]_|github_pat_)\S+$/u;
const WHITESPACE_PATTERN = /\s+/u;

const TokenSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => !SCHEME_ONLY.test(value));

function encodeBasic(credentials: string): string {
	return Buffer.from(credentials, "utf8").toString("base64");
}

function decodeBasicToken(encoded: string): string {
	const decoded = Buffer.from(encoded, "base64").toString("utf8");
	const separator = decoded.indexOf(":");
	return separator >= 0 ? decoded.slice(separator + 1) : decoded;
}

function senseToken(raw: string): {
	readonly kind: AccessTokenKind;
	readonly credential: string;
} {
	const bearerMatch = BEARER_PREFIX.exec(raw);
	if (bearerMatch?.[1]) {
		return { kind: "bearer", credential: bearerMatch[1] };
	}
	const basicMatch = BASIC_PREFIX.exec(raw);
	if (basicMatch?.[1]) {
		return { kind: "basic", credential: basicMatch[1] };
	}
	if (raw.includes(":")) {
		return { kind: "basic", credential: encodeBasic(raw) };
	}
	if (JWT_PATTERN.test(raw) || GITHUB_TOKEN_PATTERN.test(raw)) {
		return { kind: "bearer", credential: raw };
	}
	return { kind: "pat", credential: raw };
}

const JwtClaimsSchema = z.object({
	scp: z.string().optional(),
	roles: z.array(z.string()).optional(),
});

function parseJwtScopes(credential: string): readonly string[] | null {
	if (!JWT_PATTERN.test(credential)) {
		return null;
	}
	const payloadSegment = credential.split(".")[1];
	if (!payloadSegment) {
		return null;
	}
	try {
		const raw = JSON.parse(
			Buffer.from(payloadSegment, "base64url").toString("utf8"),
		) as z.input<typeof JwtClaimsSchema>;
		const claims = JwtClaimsSchema.safeDecode(raw);
		if (!claims.success) {
			return null;
		}
		if (typeof claims.data.scp === "string") {
			return claims.data.scp
				.trim()
				.split(WHITESPACE_PATTERN)
				.filter((scope) => scope.length > 0);
		}
		if (Array.isArray(claims.data.roles)) {
			return claims.data.roles;
		}
		return null;
	} catch {
		return null;
	}
}

export class AccessToken {
	readonly #kind: AccessTokenKind;
	readonly #credential: string;
	private constructor(kind: AccessTokenKind, credential: string) {
		this.#kind = kind;
		this.#credential = credential;
	}
	static from(raw: string): z.ZodSafeParseResult<AccessToken> {
		return TokenSchema.transform((value) => {
			const sensed = senseToken(value);
			return new AccessToken(sensed.kind, sensed.credential);
		}).safeDecode(raw);
	}
	kind(): AccessTokenKind {
		return this.#kind;
	}
	isBearer(): boolean {
		return this.#kind === "bearer";
	}
	isBasic(): boolean {
		return this.#kind === "basic";
	}
	isPat(): boolean {
		return this.#kind === "pat";
	}
	scopes(): readonly string[] | null {
		return parseJwtScopes(this.#credential);
	}
	hasScope(accepted: readonly string[]): boolean {
		const granted = this.scopes();
		return (
			granted === null || accepted.some((scope) => granted.includes(scope))
		);
	}
	toBearer(): AccessToken {
		if (this.#kind === "bearer") {
			return this;
		}
		const token =
			this.#kind === "basic"
				? decodeBasicToken(this.#credential)
				: this.#credential;
		return new AccessToken("bearer", token);
	}
	toBasic(): AccessToken {
		if (this.#kind === "basic") {
			return this;
		}
		return new AccessToken("basic", encodeBasic(`:${this.#credential}`));
	}
	authorizationHeader(): string {
		if (this.#kind === "bearer") {
			return `Bearer ${this.#credential}`;
		}
		if (this.#kind === "basic") {
			return `Basic ${this.#credential}`;
		}
		return `Basic ${encodeBasic(`:${this.#credential}`)}`;
	}
	requestInit(): {
		readonly headers: Readonly<Record<string, string>>;
	} {
		return {
			headers: {
				accept: "application/json",
				authorization: this.authorizationHeader(),
			},
		};
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
