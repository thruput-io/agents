import assert from "node:assert/strict";
import { test as it } from "node:test";
import { hostErrorReason } from "./http-error.ts";
import {
	anonymousHttpTransport,
	hasOauthScope,
	isJsonResponse,
	transportFromEnv,
} from "./http-transport.ts";

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
