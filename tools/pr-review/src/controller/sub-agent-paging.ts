import type {
	Rulebook as ExternalRulebook,
	PageResponse,
	RulesetPageResponse,
	RulesetUrl,
	RulesPageResponse,
	SurfaceFile,
} from "../domain/contracts.g.ts";
import { isNullOrEmpty, nonnull } from "../domain/nullish.ts";
import {
	paginateRulebook,
	paginateSurface,
	paginateText,
} from "../domain/pagination.ts";
import type { Rulebook } from "../domain/rulebook.ts";
import type { ProbeStorage } from "./probe-storage.ts";

const readCursor = (storage: ProbeStorage): number => {
	const cursor = storage.readCursor();
	if (cursor === null) {
		return -1;
	}
	return cursor;
};

const nextSurfacePage = (
	files: readonly SurfaceFile[],
	storage: ProbeStorage,
): PageResponse => {
	const pages = paginateSurface(files);
	const totalFiles = files.length;
	const totalPages = pages.length;
	if (totalPages === 0) {
		return { success: true, status: "end", totalFiles: 0, totalPages: 0 };
	}
	const target = readCursor(storage) + 1;
	if (target >= totalPages) {
		storage.writeCursor(totalPages);
		return { success: true, status: "end", totalFiles, totalPages };
	}
	storage.writeCursor(target);
	return nonnull(pages[target]);
};

const prevSurfacePage = (
	files: readonly SurfaceFile[],
	storage: ProbeStorage,
): PageResponse => {
	const pages = paginateSurface(files);
	const totalFiles = files.length;
	const totalPages = pages.length;
	if (totalPages === 0) {
		return { success: true, status: "start", totalFiles: 0, totalPages: 0 };
	}
	const target = readCursor(storage) - 1;
	if (target < 0) {
		storage.writeCursor(-1);
		return { success: true, status: "start", totalFiles, totalPages };
	}
	storage.writeCursor(target);
	return nonnull(pages[target]);
};

const paginateContextRuleset = (
	rulesets: readonly ExternalRulebook[],
	url: RulesetUrl,
	page: number,
): RulesetPageResponse => {
	const book = rulesets.find((entry) => entry.url === url);
	if (isNullOrEmpty(book)) {
		return {
			success: false,
			error: `Unknown ruleset URL: ${url}. Choose one of the URLs returned in ack under #/rulesets.`,
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

const paginateProbeRulebook = (
	rulebook: Rulebook,
	page: number,
): RulesPageResponse => {
	const chunks = paginateRulebook(rulebook.toRuleset());
	if (page < 1 || page > chunks.length) {
		return {
			success: false,
			error: `Rules page ${page} is out of range (valid pages: 1..${chunks.length}).`,
		};
	}
	return nonnull(chunks[page - 1]);
};

export {
	nextSurfacePage,
	paginateContextRuleset,
	paginateProbeRulebook,
	prevSurfacePage,
};
