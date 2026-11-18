import { JWT_PATTERN } from "./jwt-scopes.ts";

type AccessTokenKind = "bearer" | "basic" | "pat";

interface TokenCredential {
	readonly kind: AccessTokenKind;
	readonly credential: string;
}

interface TokenBehavior {
	readonly kind: AccessTokenKind;
	readonly toBearer: (credential: string) => TokenCredential;
	readonly toBasic: (credential: string) => TokenCredential;
	readonly authHeader: (credential: string) => string;
	readonly forGitHub: (credential: string) => TokenCredential;
	readonly forAzure: (credential: string) => TokenCredential;
	readonly authGuidance: (envVar: string) => string;
}

const BEARER_PREFIX = /^bearer\s+(?<token>\S+)$/iu;
const BASIC_PREFIX = /^basic\s+(?<token>\S+)$/iu;
const GITHUB_TOKEN_PATTERN = /^(?:gh[pousr]_|github_pat_)\S+$/u;

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

const TOKEN_BEHAVIORS: Readonly<Record<AccessTokenKind, TokenBehavior>> = {
	bearer: {
		kind: "bearer",
		toBearer: (credential) => ({ kind: "bearer", credential }),
		toBasic: (credential) => ({
			kind: "basic",
			credential: encodeBasic(`:${credential}`),
		}),
		authHeader: (credential) => `Bearer ${credential}`,
		forGitHub: (credential) => ({ kind: "bearer", credential }),
		forAzure: (credential) => ({ kind: "bearer", credential }),
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
		forGitHub: (credential) => ({ kind: "basic", credential }),
		forAzure: (credential) => ({ kind: "basic", credential }),
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
		forGitHub: (credential) => ({ kind: "bearer", credential }),
		forAzure: (credential) => ({
			kind: "basic",
			credential: encodeBasic(`:${credential}`),
		}),
		authGuidance: (envVar) =>
			`access denied for pat token (verify ${envVar} or AccessToken permissions)`,
	},
};

function senseToken(raw: string): TokenCredential {
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

export type { AccessTokenKind, TokenBehavior };
export { senseToken, TOKEN_BEHAVIORS };
