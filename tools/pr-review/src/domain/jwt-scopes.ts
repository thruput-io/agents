import { z } from "zod";
import { isValidJsonObject } from "./json-object.ts";

interface JwtScopes {
	readonly granted: () => readonly string[] | null;
	readonly hasScope: (accepted: readonly string[]) => boolean;
}

const UNCONSTRAINED_SCOPES: JwtScopes = {
	granted: () => null,
	hasScope: () => true,
};

function constrainedScopes(values: readonly string[]): JwtScopes {
	return {
		granted: () => values,
		hasScope: (accepted) => accepted.some((scope) => values.includes(scope)),
	};
}

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const WHITESPACE_PATTERN = /\s+/u;

const JwtClaimsSchema = z.object({
	scp: z.string().optional(),
	roles: z.array(z.string()).optional(),
});

function parseJwtScopes(credential: string): JwtScopes {
	if (!JWT_PATTERN.test(credential)) {
		return UNCONSTRAINED_SCOPES;
	}
	const [, payloadSegment] = credential.split(".");
	if (!payloadSegment) {
		return UNCONSTRAINED_SCOPES;
	}
	const decoded = Buffer.from(payloadSegment, "base64url").toString("utf8");
	if (!isValidJsonObject(decoded)) {
		return UNCONSTRAINED_SCOPES;
	}
	const raw = JSON.parse(decoded) as z.input<typeof JwtClaimsSchema>;
	const claims = JwtClaimsSchema.safeDecode(raw);
	if (!claims.success) {
		return UNCONSTRAINED_SCOPES;
	}
	if (typeof claims.data.scp === "string") {
		return constrainedScopes(
			claims.data.scp
				.trim()
				.split(WHITESPACE_PATTERN)
				.filter((scope) => scope.length > 0),
		);
	}
	if (Array.isArray(claims.data.roles)) {
		return constrainedScopes(claims.data.roles);
	}
	return UNCONSTRAINED_SCOPES;
}

export { JWT_PATTERN, parseJwtScopes };
