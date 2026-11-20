import type {
	ContextFragment,
	Fragment,
	LineText,
	Rule,
	Ruleset,
	RulesPage,
	Surface,
	SurfaceFile,
	SurfaceLine,
	SurfaceOverview,
	SurfacePage,
	SurfacePageFile,
} from "./contracts.g.ts";
import { nonnull } from "./nullish.ts";

const MAX_PAGE_JSON_BYTES = 8500;
const TEXT_PAGE_ENVELOPE_RESERVE_BYTES = 700;

interface MutableChunk {
	readonly fragments: Fragment[];
}

const fitsBytes = (candidate: unknown, maxBytes: number): boolean =>
	Buffer.byteLength(JSON.stringify(candidate), "utf8") <= maxBytes;

const singleSlicePageCandidate = (
	path: string,
	fragments: readonly Fragment[],
): SurfacePage => ({
	success: true,
	status: "page",
	page: 9999,
	totalPages: 9999,
	totalFiles: 9999,
	files: [
		{
			fileIndex: 9999,
			filePage: 9999,
			fileTotalPages: 9999,
			path,
			fragments: [...fragments],
		},
	],
});

const multiFilePageCandidate = (
	slices: readonly SurfacePageFile[],
): SurfacePage => ({
	success: true,
	status: "page",
	page: 9999,
	totalPages: 9999,
	totalFiles: 9999,
	files: [...slices],
});

const pushFragmentLine = (
	chunk: MutableChunk,
	kind: Fragment["kind"],
	line: LineText | SurfaceLine,
): void => {
	const last = chunk.fragments.at(-1);
	if (kind === "context") {
		const textLine = line as LineText;
		if (last !== undefined && last.kind === "context") {
			last.lines.push(textLine);
			return;
		}
		chunk.fragments.push({ kind: "context", lines: [textLine] });
		return;
	}
	const surfaceLine = line as SurfaceLine;
	if (last !== undefined && last.kind === "surface") {
		last.lines.push(surfaceLine);
		return;
	}
	chunk.fragments.push({
		kind: "surface",
		side: "head",
		lines: [surfaceLine],
	});
};

const popLastLine = (chunk: MutableChunk): void => {
	const last = nonnull(chunk.fragments.at(-1));
	last.lines.pop();
	if (last.lines.length === 0) {
		chunk.fragments.pop();
	}
};

const splitFileFragments = (
	file: SurfaceFile,
	maxBytes: number,
): readonly (readonly Fragment[])[] => {
	if (
		fitsBytes(singleSlicePageCandidate(file.path, file.fragments), maxBytes)
	) {
		return [file.fragments];
	}
	const chunks: Fragment[][] = [];
	let current: MutableChunk = { fragments: [] };
	for (const fragment of file.fragments) {
		for (const line of fragment.lines) {
			pushFragmentLine(current, fragment.kind, line);
			const hasMultipleLines =
				current.fragments.length > 1 ||
				(current.fragments[0]?.lines.length ?? 0) > 1;
			if (
				hasMultipleLines &&
				!fitsBytes(
					singleSlicePageCandidate(file.path, current.fragments),
					maxBytes,
				)
			) {
				popLastLine(current);
				chunks.push(current.fragments);
				current = { fragments: [] };
				pushFragmentLine(current, fragment.kind, line);
			}
		}
	}
	if (current.fragments.length > 0) {
		chunks.push(current.fragments);
	}
	return chunks;
};

const toFileSlices = (
	files: readonly SurfaceFile[],
	maxBytes: number,
): readonly SurfacePageFile[] =>
	files.flatMap((file, index) => {
		const chunks = splitFileFragments(file, maxBytes);
		const fileTotalPages = chunks.length;
		return chunks.map(
			(fragments, chunkIndex): SurfacePageFile => ({
				fileIndex: index + 1,
				filePage: chunkIndex + 1,
				fileTotalPages,
				path: file.path,
				fragments: fragments as (
					| ContextFragment
					| (Fragment & { kind: "surface" })
				)[],
			}),
		);
	});

const packFileSlices = (
	slices: readonly SurfacePageFile[],
	maxBytes: number,
): readonly (readonly SurfacePageFile[])[] => {
	const groups: SurfacePageFile[][] = [];
	let current: SurfacePageFile[] = [];
	for (const slice of slices) {
		const candidate = [...current, slice];
		if (
			current.length > 0 &&
			!fitsBytes(multiFilePageCandidate(candidate), maxBytes)
		) {
			groups.push(current);
			current = [slice];
		} else {
			current.push(slice);
		}
	}
	if (current.length > 0) {
		groups.push(current);
	}
	return groups;
};

function paginateSurfaceWithin(
	files: readonly SurfaceFile[],
	maxBytes: number,
): readonly SurfacePage[] {
	const slices = toFileSlices(files, maxBytes);
	const packed = packFileSlices(slices, maxBytes);
	const totalPages = packed.length;
	const totalFiles = files.length;
	return packed.map((group, idx) => ({
		success: true,
		status: "page",
		page: idx + 1,
		totalPages,
		totalFiles,
		files: [...group],
	}));
}

function paginateSurface(
	files: readonly SurfaceFile[],
): readonly SurfacePage[] {
	return paginateSurfaceWithin(files, MAX_PAGE_JSON_BYTES);
}

const surfaceOverview = (surface: Surface): SurfaceOverview => ({
	headCommit: surface.headCommit,
	changedFiles: surface.files.length,
	totalPages: paginateSurfaceWithin(surface.files, MAX_PAGE_JSON_BYTES).length,
});

const rulesPageCandidate = (
	instructions: Ruleset["instructions"],
	rules: readonly Rule[],
	allPrinciples: Ruleset["principles"],
): RulesPage => {
	const parentIds = new Set(rules.map((rule) => rule.parent));
	const principles = allPrinciples.filter((p) => parentIds.has(p.id));
	return {
		success: true,
		page: 9999,
		totalPages: 9999,
		ruleset: {
			instructions,
			rules: [...rules],
			principles,
		},
	};
};

function paginateRulebookWithin(
	ruleset: Ruleset,
	maxBytes: number,
): readonly RulesPage[] {
	const groups: Rule[][] = [];
	let current: Rule[] = [];
	for (const rule of ruleset.rules) {
		const candidate = [...current, rule];
		if (
			current.length > 0 &&
			!fitsBytes(
				rulesPageCandidate(ruleset.instructions, candidate, ruleset.principles),
				maxBytes,
			)
		) {
			groups.push(current);
			current = [rule];
		} else {
			current.push(rule);
		}
	}
	if (current.length > 0) {
		groups.push(current);
	}
	const totalPages = groups.length;
	return groups.map((pageRules, idx) => {
		const built = rulesPageCandidate(
			ruleset.instructions,
			pageRules,
			ruleset.principles,
		);
		return {
			...built,
			page: idx + 1,
			totalPages,
		};
	});
}

function paginateRulebook(ruleset: Ruleset): readonly RulesPage[] {
	return paginateRulebookWithin(ruleset, MAX_PAGE_JSON_BYTES);
}

function paginateText(text: string): readonly string[] {
	return paginateTextWithin(
		text,
		MAX_PAGE_JSON_BYTES - TEXT_PAGE_ENVELOPE_RESERVE_BYTES,
	);
}

function paginateTextWithin(text: string, maxBytes: number): readonly string[] {
	if (Buffer.byteLength(JSON.stringify(text), "utf8") <= maxBytes) {
		return [text];
	}
	const lines = text.split("\n");
	const pages: string[] = [];
	let current: string[] = [];
	for (const line of lines) {
		const candidate = [...current, line].join("\n");
		if (
			current.length > 0 &&
			Buffer.byteLength(JSON.stringify(candidate), "utf8") > maxBytes
		) {
			pages.push(current.join("\n"));
			current = [line];
		} else {
			current.push(line);
		}
	}
	if (current.length > 0) {
		pages.push(current.join("\n"));
	}
	return pages;
}

export { paginateRulebook, paginateSurface, paginateText, surfaceOverview };
