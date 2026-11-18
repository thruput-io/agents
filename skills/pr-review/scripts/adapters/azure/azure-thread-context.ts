import type { z } from "zod";
import { PullRequestThreadsListResponse } from "../../../clients/azure-git.zod.g.ts";
import type { Side } from "../../domain/contracts.g.ts";
import { isNullOrEmpty } from "../../domain/nullish.ts";

const LEADING_SLASH = /^\//u;

const AzureThreadTransportSchema =
	PullRequestThreadsListResponse.shape.value.element;

type AzureThreadContext = z.infer<
	typeof AzureThreadTransportSchema
>["threadContext"];

const CONTEXT_BY_SIDE: Readonly<
	Record<
		Side,
		(
			filePath: string,
			start: { readonly line: number; readonly offset: number },
			end: { readonly line: number; readonly offset: number },
		) => NonNullable<AzureThreadContext>
	>
> = {
	head: (filePath, rightFileStart, rightFileEnd) => ({
		filePath,
		rightFileStart,
		rightFileEnd,
	}),
	base: (filePath, leftFileStart, leftFileEnd) => ({
		filePath,
		leftFileStart,
		leftFileEnd,
	}),
};

export function decodeAzureThreadContext(context: AzureThreadContext): {
	readonly path: string;
	readonly side: Side;
	readonly lines: { readonly start: number; readonly end: number };
} {
	const path = (context?.filePath ?? "").replace(LEADING_SLASH, "");
	if (
		context !== undefined &&
		context !== null &&
		!isNullOrEmpty(context.rightFileEnd)
	) {
		const end = context.rightFileEnd.line ?? 1;
		return {
			path,
			side: "head",
			lines: { start: context.rightFileStart?.line ?? end, end },
		};
	}
	const end = context?.leftFileEnd?.line ?? 1;
	return {
		path,
		side: "base",
		lines: { start: context?.leftFileStart?.line ?? end, end },
	};
}

export function encodeAzureThreadContext(
	path: string,
	side: Side,
	lines: { readonly start: number; readonly end: number },
): NonNullable<AzureThreadContext> {
	return CONTEXT_BY_SIDE[side](
		`/${path}`,
		{ line: lines.start, offset: 1 },
		{ line: lines.end, offset: 1 },
	);
}
