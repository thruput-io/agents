import { z } from "zod";
import {
	GithubPullRequest,
	rehydrateCodeUnderReview,
} from "../domain/code-under-review.ts";
import type { PersistedPullRequest } from "../domain/contracts.g.ts";
import type { HostAdapter, HostAdapterPort } from "../domain/host-adapter.ts";
import { nonnull } from "../domain/nullish.ts";
import type { ProbeCatalogPort } from "../domain/ports.ts";
import {
	type ProbeDocument,
	toAgentInstructions,
} from "../domain/probe-document.ts";
import { Rulebook } from "../domain/rulebook.ts";

const SHA1_HEX_LENGTH = 40;
const H = "a".repeat(SHA1_HEX_LENGTH);

const sampleRulebook = () =>
	nonnull(
		Rulebook.slice(
			[
				{
					id: "Stated purpose",
					body: "State the [[Purpose]] of every [[Change]].",
					parent: "You aren't gonna need it",
					marker: "MUST",
					group: "Purpose",
				},
			],
			{
				principles: [
					{
						id: "You aren't gonna need it",
						body: "Always implement things when you actually need them.",
						parent: "Code is a liability, not an asset",
					},
				],
			},
		).data,
	);

const sampleFile = {
	path: "a.ts",
	fragments: [
		{
			kind: "surface" as const,
			side: "head" as const,
			lines: [
				{
					idToReportViolationOn: "a.ts:1",
					text: "const x = 1;",
				},
			],
		},
	],
};

const sampleSurface = [sampleFile];

const sampleChange = {
	host: {
		kind: "github" as const,
		owner: "thruput-io",
		repository: "agents",
		number: 14,
	},
	author: "author",
	description: "Body",
};

const createReviewedPr = () => {
	const pr = nonnull(GithubPullRequest.from(sampleChange.host).data);
	return pr.withReview(sampleSurface, sampleFile.fragments, {
		threads: [],
	});
};

const defaultStubAdapter: HostAdapter = {
	host: () => sampleChange.host,
	resolve: () =>
		Promise.resolve({
			kind: "already-reviewed",
			headCommit: H,
			location: "stub://review",
		}),
	post: () => Promise.resolve("stub://review"),
};

const createStubAdapterPort = (adapter: HostAdapter): HostAdapterPort => {
	const decodeUrl = (url: string) =>
		z
			.url()
			.transform(() => adapter)
			.safeDecode(url);
	const rehydrate = (persisted: PersistedPullRequest) => ({
		pullRequest: rehydrateCodeUnderReview(persisted),
		adapter,
	});
	return {
		from: decodeUrl,
		fromWithToken: decodeUrl,
		rehydrate,
		rehydrateWithToken: rehydrate,
	};
};

const createStubLoadProbes = (): ProbeCatalogPort => {
	const rb = sampleRulebook();
	const rulesetUrl = "https://books.example/ddd.md";
	const rulesets = [
		{
			url: rulesetUrl,
			title: "DDD",
			focus: "Domain",
			whenToUse: "Always",
			text: "## R1\nRule one\n",
		},
	];
	return (change, surface, checkout) => {
		const rulesProbe: ProbeDocument = {
			kind: "rules",
			change,
			surface,
			rulebook: rb,
		};
		const contextProbe: ProbeDocument = {
			kind: "context",
			change,
			surface,
			rulesets,
			checkout,
		};
		return Promise.resolve({
			rulesets,
			probes: [
				{
					name: "01-purpose",
					probe: rulesProbe,
					auditDocument: toAgentInstructions(rulesProbe),
				},
				{
					name: "02-context",
					probe: contextProbe,
					auditDocument: toAgentInstructions(contextProbe),
				},
			],
		});
	};
};

const rulesAuditDocument = (rb: Rulebook) =>
	toAgentInstructions({
		kind: "rules",
		change: sampleChange,
		surface: { headCommit: H, files: sampleSurface },
		rulebook: rb,
	});

export {
	createReviewedPr,
	createStubAdapterPort,
	createStubLoadProbes,
	defaultStubAdapter,
	H,
	rulesAuditDocument,
	sampleChange,
	sampleFile,
	sampleRulebook,
	sampleSurface,
};
