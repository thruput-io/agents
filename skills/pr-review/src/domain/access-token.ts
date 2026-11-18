import { z } from "zod";

type AccessTokenKind = "bearer" | "basic" | "pat";

interface TokenBehavior {
	readonly kind: AccessTokenKind;
	readonly toBearer: (credential: string) => {
		readonly kind: AccessTokenKind;
		readonly credential: string;
	};
	readonly toBasic: (credential: string) => {
		readonly kind: AccessTokenKind;
		readonly credential: string;
	};
	readonly authHeader: (credential: string) => string;
	readonly forGitHub: (token: AccessToken) => AccessToken;
	readonly forAzure: (token: AccessToken) => AccessToken;
	readonly authGuidance: (envVar: string) => string;
}

const TOKEN_BEHAVIORS: Readonly<Record<AccessTokenKind, TokenBehavior>> = {
	bearer: {
		kind: "bearer",
		toBearer: (credential) => ({ kind: "bearer", credential }),
		toBasic: (credential) => ({
			kind: "basic",
			credential: encodeBasic(`:${credential}`),
		}),
		authHeader: (credential) => `Bearer ${credential}`,
		forGitHub: (token) => token,
		forAzure: (token) => token,
		authGuidance: (envVar) =>
			`access denied for bearer token (verify ${envVar} or AccessToken permissions)`,
	},
	basic: {
		kind: "basic",
		toBearer: (credential) => ({
			kind: "bearer",
			credential: decodeBasicToken(credential),
		}),
		toBasic: (credential) => ({ kind: "basic", credential }),
		authHeader: (credential) => `Basic ${credential}`,
		forGitHub: (token) => token,
		forAzure: (token) => token,
		authGuidance: (envVar) =>
			`access denied for basic token (verify ${envVar} or AccessToken permissions)`,
	},
	pat: {
		kind: "pat",
		toBearer: (credential) => ({ kind: "bearer", credential }),
		toBasic: (credential) => ({
			kind: "basic",
			credential: encodeBasic(`:${credential}`),
		}),
		authHeader: (credential) => `Basic ${encodeBasic(`:${credential}`)}`,
		forGitHub: (token) => token.toBearer(),
		forAzure: (token) => token.toBasic(),
		authGuidance: (envVar) =>
			`access denied for pat token (verify ${envVar} or AccessToken permissions)`,
	},
};

const BEARER_PREFIX = /^bearer\s+(?<token>\S+)$/iu;
const BASIC_PREFIX = /^basic\s+(?<token>\S+)$/iu;
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
	if (separator >= 0) {
		return decoded.slice(separator + 1);
	}
	return decoded;
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
	const [, payloadSegment] = credential.split(".");
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
		return parseJwtScopes(this.#credential);
	}
	hasScope(accepted: readonly string[]): boolean {
		const granted = this.scopes();
		return (
			granted === null || accepted.some((scope) => granted.includes(scope))
		);
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
		return this.#behavior.forGitHub(this);
	}
	forAzure(): AccessToken {
		return this.#behavior.forAzure(this);
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

export type { AccessTokenKind };
