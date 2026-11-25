import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { z } from "zod";

const NOT_FOUND = 404;

const [root, port] = z
	.tuple([z.string().min(1), z.coerce.number().int().positive()])
	.parse(process.argv.slice(2));

const server = createServer((request, response) => {
	const { pathname } = new URL(z.string().parse(request.url), "http://mock");

	createReadStream(join(root, pathname))
		.on("error", () => {
			response.writeHead(NOT_FOUND).end();
		})
		.pipe(response);
});

server.listen(port, () => {
	process.stdout.write("listening\n");
});
