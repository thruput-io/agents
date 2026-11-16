import { http } from "msw";
import { setupServer } from "msw/node";
import { z } from "zod";
import { nonnull } from "../domain/nullish.ts";

const BridgeResponseSchema = z.object({
	status: z.number().int(),
	headers: z.array(z.tuple([z.string(), z.string()])),
	bodyBase64: z.string(),
});

const { PR_REVIEW_MOCK_BRIDGE_URL: bridgeUrlRaw } = process.env;
const bridgeUrl = nonnull(bridgeUrlRaw);

const forwardToBridge = async ({
	request,
}: {
	readonly request: Request;
}): Promise<Response> => {
	const bodyBytes = Buffer.from(await request.arrayBuffer());
	const response = await fetch(bridgeUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			url: request.url,
			method: request.method,
			headers: [...request.headers.entries()],
			bodyBase64: bodyBytes.toString("base64"),
		}),
	});
	const payload = BridgeResponseSchema.parse(await response.json());
	return new Response(Buffer.from(payload.bodyBase64, "base64"), {
		status: payload.status,
		headers: payload.headers,
	});
};

const server = setupServer(
	http.all("https://api.github.com/*", forwardToBridge),
	http.all("https://dev.azure.com/*", forwardToBridge),
	http.all("https://raw.githubusercontent.com/*", forwardToBridge),
	http.all("https://github.com/*", forwardToBridge),
);

server.listen();
