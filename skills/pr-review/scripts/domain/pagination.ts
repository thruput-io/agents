import type {
	ContextFragment,
	Fragment,
	LineText,
	Surface,
	SurfaceFile,
	SurfaceLine,
	SurfaceOverview,
	SurfacePage,
} from "./contracts.g.ts";
import { nonnull } from "./nullish.ts";

const MAX_PAGE_JSON_BYTES = 8500;

interface MutableChunk {
	readonly fragments: Fragment[];
}

const fitsBytes = (candidate: unknown, maxBytes: number): boolean =>
	Buffer.byteLength(JSON.stringify(candidate), "utf8") <= maxBytes;

const pageCandidate = (
	path: string,
	fragments: readonly Fragment[],
): SurfacePage => ({
	success: true,
	status: "page",
	page: 9999,
	totalPages: 9999,
	fileIndex: 9999,
	totalFiles: 9999,
	filePage: 9999,
	fileTotalPages: 9999,
	path,
	fragments: [...fragments],
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
	if (fitsBytes(pageCandidate(file.path, file.fragments), maxBytes)) {
		return [file.fragments];
	}
	const chunks: Fragment[][] = [];
	let current: MutableChunk = { fragments: [] };
	for (const fragment of file.fragments) {
		for (const line of fragment.lines) {
			pushFragmentLine(current, fragment.kind, line);
			if (
				current.fragments.length > 0 &&
				!(
					current.fragments.length === 1 &&
					current.fragments[0]?.lines.length === 1
				) &&
				!fitsBytes(pageCandidate(file.path, current.fragments), maxBytes)
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

export function paginateSurface(
	files: readonly SurfaceFile[],
	maxBytes = MAX_PAGE_JSON_BYTES,
): readonly SurfacePage[] {
	const grouped = files.map((file, index) => ({
		fileIndex: index + 1,
		path: file.path,
		chunks: splitFileFragments(file, maxBytes),
	}));
	const totalPages = grouped.reduce(
		(sum, entry) => sum + entry.chunks.length,
		0,
	);
	const totalFiles = files.length;
	const pages: SurfacePage[] = [];
	for (const entry of grouped) {
		const fileTotalPages = entry.chunks.length;
		entry.chunks.forEach((fragments, chunkIndex) => {
			pages.push({
				success: true,
				status: "page",
				page: pages.length + 1,
				totalPages,
				fileIndex: entry.fileIndex,
				totalFiles,
				filePage: chunkIndex + 1,
				fileTotalPages,
				path: entry.path,
				fragments: fragments as (
					| ContextFragment
					| (Fragment & { kind: "surface" })
				)[],
			});
		});
	}
	return pages;
}

export const surfaceOverview = (
	surface: Surface,
	maxBytes = MAX_PAGE_JSON_BYTES,
): SurfaceOverview => ({
	headCommit: surface.headCommit,
	changedFiles: surface.files.length,
	totalPages: paginateSurface(surface.files, maxBytes).length,
});

export function paginateText(
	text: string,
	maxBytes = MAX_PAGE_JSON_BYTES - 700,
): readonly string[] {
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
