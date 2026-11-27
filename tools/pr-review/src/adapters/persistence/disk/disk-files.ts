import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Files } from "./disk-store.ts";

const diskFiles: Files = {
	read: (path: string): Promise<string> => readFile(path, "utf8"),
	write: async (path: string, text: string): Promise<void> => {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, text);
	},
	append: (path: string, text: string): Promise<void> => appendFile(path, text),
};

export { diskFiles };
