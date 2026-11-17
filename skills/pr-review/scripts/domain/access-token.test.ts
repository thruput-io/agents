import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	anonymousHttpTransport,
	hasOauthScope,
	hostErrorReason,
	isJsonResponse,
	transportFromEnv,
} from "../adapters/http-transport.ts";
import { AccessToken } from "./access-token.ts";
import { nonnull } from "./nullish.ts";

const JWT_HEADER = Buffer.from(
	JSON.stringify({ alg: "HS256" }),
	"utf8",
).toString("base64url");
const JWT_CLAIMS_PART = Buffer.from(
	JSON.stringify({ sub: "1" }),
	"utf8",
).toString("base64url");
const SAMPLE_JWT = [JWT_HEADER, JWT_CLAIMS_PART, "sig"].join(".");
const BAD_JWT = [JWT_HEADER, "not_json", "sig"].join(".");
const parseToken = (raw: string) => nonnull(AccessToken.from(raw).data);

it("AccessToken senses bearer, basic, and pat tokens and converts formats", () => {
	const first = parseToken("ghp_secret");
	const second = parseToken("Bearer ghp_secret");
	const other = parseToken("ghp_other");
	const jwt = parseToken(SAMPLE_JWT);
	const pat = parseToken("azdo-raw-pat");
	const basicColon = parseToken(":azdo-raw-pat");
	const basicHeader = parseToken(
		`Basic ${Buffer.from(":azdo-raw-pat", "utf8").toString("base64")}`,
	);

	assert.equal(first.kind(), "bearer");
	assert.equal(first.isBearer(), true);
	assert.equal(first.isBasic(), false);
	assert.equal(first.isPat(), false);
	assert.equal(jwt.isBearer(), true);

	assert.equal(pat.kind(), "pat");
	assert.equal(pat.isPat(), true);
	assert.equal(pat.toBasic().isBasic(), true);
	assert.equal(pat.toBasic().equals(basicColon), true);
	assert.equal(basicColon.equals(basicHeader), true);
	assert.equal(
		basicColon.toBearer().authorizationHeader(),
		"Bearer azdo-raw-pat",
	);
	assert.equal(pat.toBearer().authorizationHeader(), "Bearer azdo-raw-pat");
	assert.equal(
		first.toBasic().authorizationHeader(),
		`Basic ${Buffer.from(":ghp_secret", "utf8").toString("base64")}`,
	);

	assert.equal(first.equals(second), true);
	assert.equal(first.equals(other), false);
	assert.deepEqual(first.requestInit(), {
		headers: {
			accept: "application/json",
			authorization: "Bearer ghp_secret",
		},
	});
	assert.deepEqual(first.requestInitWithHeaders({ accept: "text/plain" }), {
		headers: {
			accept: "text/plain",
			authorization: "Bearer ghp_secret",
		},
	});
	assert.equal(AccessToken.from("").success, false);
	assert.equal(AccessToken.from("Bearer ").success, false);
});

it("AccessToken parses JWT scopes and rejects malformed or missing scope claims", () => {
	const first = parseToken("ghp_secret");
	const jwt = parseToken(SAMPLE_JWT);
	const makeJwt = (claims: unknown) =>
		`${JWT_HEADER}.${Buffer.from(JSON.stringify(claims), "utf8").toString("base64url")}.sig`;
	const scpJwt = parseToken(makeJwt({ scp: "vso.code_write vso.work" }));
	const rolesJwt = parseToken(makeJwt({ roles: ["user_impersonation"] }));
	const badJwt = parseToken(BAD_JWT);
	const nonStringScpJwt = parseToken(makeJwt({ scp: 123 }));

	assert.equal(first.scopes(), null);
	assert.equal(first.hasScope(["repo"]), true);
	assert.equal(jwt.scopes(), null);
	assert.deepEqual(scpJwt.scopes(), ["vso.code_write", "vso.work"]);
	assert.equal(scpJwt.hasScope(["vso.code_write"]), true);
	assert.equal(scpJwt.hasScope(["vso.code_manage"]), false);
	assert.deepEqual(rolesJwt.scopes(), ["user_impersonation"]);
	assert.equal(rolesJwt.hasScope(["user_impersonation"]), true);
	assert.equal(rolesJwt.hasScope(["vso.code_write"]), false);
	assert.equal(badJwt.scopes(), null);
	assert.equal(nonStringScpJwt.scopes(), null);
});

it("isJsonResponse, hasOauthScope, and hostErrorReason classify HTTP responses", () => {
	const jsonHeaders = new Headers({ "content-type": "application/json" });
	const htmlHeaders = new Headers({
		"content-type": "text/html; charset=utf-8",
	});
	const scopeHeaders = (value: string) =>
		new Headers({ "x-oauth-scopes": value });
	assert.equal(isJsonResponse({ status: 200, headers: jsonHeaders }), true);
	assert.equal(isJsonResponse({ status: 203, headers: htmlHeaders }), false);
	assert.equal(isJsonResponse({ status: 403, headers: htmlHeaders }), false);
	assert.equal(hasOauthScope(jsonHeaders, ["repo", "public_repo"]), true);
	assert.equal(
		hasOauthScope(scopeHeaders("read:org, repo"), ["repo", "public_repo"]),
		true,
	);
	assert.equal(
		hasOauthScope(scopeHeaders("read:org, gist"), ["repo", "public_repo"]),
		false,
	);
	assert.equal(hasOauthScope(scopeHeaders(""), ["repo", "public_repo"]), false);
	const anonymous = anonymousHttpTransport();
	assert.equal(
		hostErrorReason(
			"Azure DevOps",
			"AZURE_DEVOPS_EXT_PAT",
			{ status: 403, headers: htmlHeaders },
			anonymous,
		).includes("authentication required"),
		true,
	);
	assert.equal(
		hostErrorReason(
			"Azure DevOps",
			"AZURE_DEVOPS_EXT_PAT",
			{ status: 500, headers: jsonHeaders },
			anonymous,
		),
		"Azure DevOps returned HTTP 500 (application/json).",
	);
	assert.equal(
		hostErrorReason(
			"Azure DevOps",
			"AZURE_DEVOPS_EXT_PAT",
			{
				status: 400,
				headers: jsonHeaders,
				data: {
					message:
						"TF401181: The pull request cannot be edited due to its state.",
				},
			},
			anonymous,
		),
		"Azure DevOps returned HTTP 400 (application/json): pull request is not writeable (TF401181: The pull request cannot be edited due to its state.). Review must halt.",
	);
});

it("transportFromEnv selects anonymous or token-authenticated HTTP headers per host", () => {
	const anonymous = anonymousHttpTransport();
	assert.deepEqual(anonymous.requestInit(), {
		headers: { accept: "application/json" },
	});
	assert.equal(anonymous.hasScope(["repo"]), true);
	assert.equal(
		anonymous.authGuidance("GH_TOKEN"),
		"authentication required (set GH_TOKEN or pass AccessToken.from(...) to prepareWithToken)",
	);
	const emptyTransport = transportFromEnv("  ", (token) => token.forGitHub());
	assert.deepEqual(emptyTransport.requestInit(), {
		headers: { accept: "application/json" },
	});
	const ghTransport = transportFromEnv("ghp_example_token", (token) =>
		token.forGitHub(),
	);
	const { authorization: ghAuth } = ghTransport.requestInit().headers;
	assert.equal(ghAuth, "Bearer ghp_example_token");
	const patGhTransport = transportFromEnv("azdo-example-pat", (token) =>
		token.forGitHub(),
	);
	const { authorization: patGhAuth } = patGhTransport.requestInit().headers;
	assert.equal(patGhAuth, "Bearer azdo-example-pat");
	const patAzTransport = transportFromEnv("azdo-example-pat", (token) =>
		token.forAzure(),
	);
	const { authorization: patAzAuth } = patAzTransport.requestInit().headers;
	assert.equal(
		patAzAuth,
		`Basic ${Buffer.from(":azdo-example-pat", "utf8").toString("base64")}`,
	);
});
