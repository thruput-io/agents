import { appendFile, readFile, writeFile } from "node:fs/promises";
import type { Files } from "./disk-store.ts";

const diskFiles: Files = {
	read: (path: string): Promise<string> => readFile(path, "utf8"),
	write: (path: string, text: string): Promise<void> => writeFile(path, text),
	append: (path: string, text: string): Promise<void> => appendFile(path, text),
};

export { diskFiles };
