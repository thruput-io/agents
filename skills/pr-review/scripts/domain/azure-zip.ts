import { itemsList } from "../../clients/azure-git.g.ts";
import {
	buildBinaryHostError,
	type HostTransport,
	isBinaryResponse,
} from "./adapter.ts";
import type { AzureDevOps, HeadCommit, HostError } from "./contracts.g.ts";
import { isNullOrEmpty } from "./nullish.ts";
import type { CommitZipArchive } from "./snapshot-directory.ts";

const API_VERSION = { "api-version": "7.1" } as const;

export async function downloadAzureCommitZips(input: {
	readonly host: AzureDevOps;
	readonly commits: readonly HeadCommit[];
	readonly init: ReturnType<HostTransport["requestInit"]>;
	readonly transport: HostTransport;
}): Promise<CommitZipArchive[] | HostError> {
	const { host, commits, init, transport } = input;
	const zipResponses = await Promise.all(
		commits.map(async (sha) => ({
			sha,
			res: await itemsList(
				host.organization,
				host.project,
				host.repository,
				{
					scopePath: "/",
					recursionLevel: "full",
					$format: "zip",
					"versionDescriptor.version": sha,
					"versionDescriptor.versionType": "commit",
					zipForUnix: true,
					...API_VERSION,
				},
				init,
			),
		})),
	);
	const failedZip = zipResponses.find(({ res }) => !isBinaryResponse(res));
	if (!isNullOrEmpty(failedZip)) {
		return buildBinaryHostError(host, failedZip.res, transport);
	}
	return zipResponses.map(({ sha, res }) => ({ sha, zip: res.data }));
}
