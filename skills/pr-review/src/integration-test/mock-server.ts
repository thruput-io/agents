import type { Server, ServerResponse } from "node:http";
import { createServer, type IncomingMessage } from "node:http";
import { promisify } from "node:util";
import { faker } from "@faker-js/faker";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { z } from "zod";
import { nonnull } from "../domain/nullish.ts";
import { createAzureHandlers } from "./azure-mocks.ts";
import { createGitHubHandlers } from "./github-mocks.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

const FAKER_SEED = 42;
const HTTP_OK = 200;
const HTTP_INTERNAL_SERVER_ERROR = 500;

faker.seed(FAKER_SEED);

const mockServer = setupServer();

const createRulesetTextHandler = () =>
	http.get(
		"https://raw.githubusercontent.com/ciembor/agent-rules-books/*",
		() => HttpResponse.text("# Book Rules\n\n## R1\n\n## R2\n\n## R3\n"),
	);

const resetHostMocks = (repo: ScenarioRepo): void => {
	mockServer.resetHandlers(
		createRulesetTextHandler(),
		...createGitHubHandlers(repo),
		...createAzureHandlers(repo),
	);
};

const scenarioToken = "test-token";

const BridgeRequestSchema = z.object({
	url: z.string().url(),
	method: z.string().min(1),
	headers: z.array(z.tuple([z.string(), z.string()])),
	bodyBase64: z.string(),
});

const withBody = (
	method: string,
	headers: Headers,
	body: Uint8Array<ArrayBuffer>,
): RequestInit => ({ method, headers, body });

const withoutBody = (method: string, headers: Headers): RequestInit => ({
	method,
	headers,
});

const INIT_BY_METHOD = new Map<
	string,
	(
		method: string,
		headers: Headers,
		body: Uint8Array<ArrayBuffer>,
	) => RequestInit
>([
	["GET", withoutBody],
	["HEAD", withoutBody],
	["POST", withBody],
	["PUT", withBody],
	["PATCH", withBody],
	["DELETE", withBody],
]);

const readBody = async (req: IncomingMessage): Promise<string> => {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
};

const handleBridgeRequest = async (
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> => {
	const parsed = BridgeRequestSchema.parse(JSON.parse(await readBody(req)));
	const headers = new Headers(parsed.headers);
	headers.delete("host");
	headers.delete("content-length");
	headers.delete("accept-encoding");
	const rawBytes = Buffer.from(parsed.bodyBase64, "base64");
	const body = new Uint8Array(
		rawBytes.buffer.slice(
			rawBytes.byteOffset,
			rawBytes.byteOffset + rawBytes.byteLength,
		),
	);
	const upstream = await fetch(
		parsed.url,
		nonnull(INIT_BY_METHOD.get(parsed.method))(parsed.method, headers, body),
	);
	const responseBytes = Buffer.from(await upstream.arrayBuffer());
	const responseHeaders = [...upstream.headers.entries()].filter(
		([name]) => name.toLowerCase() !== "content-encoding",
	);
	res.writeHead(HTTP_OK, { "content-type": "application/json" });
	res.end(
		JSON.stringify({
			status: upstream.status,
			headers: responseHeaders,
			bodyBase64: responseBytes.toString("base64"),
		}),
	);
};

let activeBridge: { readonly server: Server; readonly url: string } | undefined;

const BridgeAddressSchema = z.object({ port: z.number().int().positive() });

const startMockBridge = async (): Promise<string> => {
	mockServer.listen();
	const server = createServer((req, res) => {
		handleBridgeRequest(req, res).catch((err: unknown) => {
			res.writeHead(HTTP_INTERNAL_SERVER_ERROR);
			res.end(String(err));
		});
	});
	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", () => resolve());
	});
	const { port } = BridgeAddressSchema.parse(server.address());
	const url = `http://127.0.0.1:${port}`;
	activeBridge = { server, url };
	return url;
};

const mockBridgeUrl = (): string => nonnull(activeBridge).url;

const stopMockBridge = async (): Promise<void> => {
	const bridge = nonnull(activeBridge);
	activeBridge = undefined;
	await promisify(bridge.server.close.bind(bridge.server))();
	mockServer.close();
};

export {
	mockBridgeUrl,
	mockServer,
	resetHostMocks,
	scenarioToken,
	startMockBridge,
	stopMockBridge,
};
