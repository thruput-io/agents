import type { PageResponse, SurfaceFile } from "../domain/contracts.g.ts";
import { nonnull } from "../domain/nullish.ts";
import { paginateSurface } from "../domain/pagination.ts";
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

export { nextSurfacePage, prevSurfacePage };
