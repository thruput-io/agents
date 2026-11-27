interface Walked {
	readonly next: number;
	readonly lines: readonly string[];
}

const FILE_START = /^(?=diff --git )/mu;
const NEW_PATH = /^\+\+\+ b\/(?<path>.+)$/mu;
const HUNK = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,\d+)? @@/u;
const FIRST_HUNK = /^@@ /mu;

const walked = (
	path: string,
	{ next, lines }: Walked,
	line: string,
): Walked => {
	const { start } = { ...HUNK.exec(line)?.groups };

	if (start !== undefined) {
		return { next: Number(start), lines };
	}

	if (line.startsWith("+")) {
		return {
			next: next + 1,
			lines: [...lines, `${path}:${next}\t${line.slice(1)}`],
		};
	}

	if (line.startsWith(" ")) {
		return { next: next + 1, lines: [...lines, `\t${line.slice(1)}`] };
	}

	return { next, lines };
};

const pageTextOf = (section: string): readonly string[] => {
	const { path } = { ...NEW_PATH.exec(section)?.groups };

	if (path === undefined) {
		return [];
	}

	const body = section.slice(section.search(FIRST_HUNK)).split("\n");
	const { lines } = body.reduce(
		(state: Walked, line: string): Walked => walked(path, state, line),
		{ next: 0, lines: [] },
	);

	return [lines.join("\n")];
};

const pagesOf = (diff: string): readonly string[] =>
	diff
		.split(FILE_START)
		.flatMap(pageTextOf)
		.filter((text: string): boolean => text.length > 0);

export { pagesOf };
