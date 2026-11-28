import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import type { Files } from "./disk-store.ts";

const diskFiles: Files = {
	read: (path: string): Promise<string> => readFile(path, "utf8"),
	make: async (path: string): Promise<void> => {
		await mkdir(path, { recursive: true });
	},
	write: (path: string, text: string): Promise<void> => writeFile(path, text),
	append: (path: string, text: string): Promise<void> => appendFile(path, text),
};

export { diskFiles };
