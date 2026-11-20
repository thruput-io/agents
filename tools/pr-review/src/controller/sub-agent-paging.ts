import type {
	Change,
	Rulebook as ExternalRulebook,
	PageResponse,
	RulesetUrl,
	RulesResponse,
	SurfaceFile,
} from "../domain/contracts.g.ts";
import { isNullOrEmpty, nonnull } from "../domain/nullish.ts";
import { paginateSurface, paginateText } from "../domain/pagination.ts";
import type { ProbeStorage } from "./probe-storage.ts";

const readCursor = (storage: ProbeStorage): number => {
	const cursor = storage.readCursor();
	if (cursor === null) {
		return -1;
	}
	return cursor;
};

const withChangeOnFirstPage = (
	page: ReturnType<typeof paginateSurface>[number],
	change: Change,
): PageResponse => {
	if (page.page === 1) {
		return { ...page, change };
	}
	return page;
};

const nextSurfacePage = (
	files: readonly SurfaceFile[],
	change: Change,
	storage: ProbeStorage,
): PageResponse => {
	const pages = paginateSurface(files);
	const totalFiles = files.length;
	const totalPages = pages.length;
	if (totalPages === 0) {
		return {
			success: true,
			status: "end",
			totalFiles: 0,
			totalPages: 0,
			change,
		};
	}
	const target = readCursor(storage) + 1;
	if (target >= totalPages) {
		storage.writeCursor(totalPages);
		return { success: true, status: "end", totalFiles, totalPages };
	}
	storage.writeCursor(target);
	return withChangeOnFirstPage(nonnull(pages[target]), change);
};

const prevSurfacePage = (
	files: readonly SurfaceFile[],
	change: Change,
	storage: ProbeStorage,
): PageResponse => {
	const pages = paginateSurface(files);
	const totalFiles = files.length;
	const totalPages = pages.length;
	if (totalPages === 0) {
		return {
			success: true,
			status: "start",
			totalFiles: 0,
			totalPages: 0,
			change,
		};
	}
	const target = readCursor(storage) - 1;
	if (target < 0) {
		storage.writeCursor(-1);
		return { success: true, status: "start", totalFiles, totalPages };
	}
	storage.writeCursor(target);
	return withChangeOnFirstPage(nonnull(pages[target]), change);
};

const paginateContextRuleset = (
	rulesets: readonly ExternalRulebook[],
	url: RulesetUrl,
	page: number,
): RulesResponse => {
	const book = rulesets.find((entry) => entry.url === url);
	if (isNullOrEmpty(book)) {
		return {
			success: false,
			error: `Unknown ruleset URL: ${url}. Choose one of the URLs returned by rules.`,
		};
	}
	const chunks = paginateText(book.text);
	if (page < 1 || page > chunks.length) {
		return {
			success: false,
			error: `Ruleset page ${page} is out of range for ${url} (valid pages: 1..${chunks.length}).`,
		};
	}
	return {
		success: true,
		url: book.url,
		title: book.title,
		page,
		totalPages: chunks.length,
		text: nonnull(chunks[page - 1]),
	};
};

export { nextSurfacePage, paginateContextRuleset, prevSurfacePage };
