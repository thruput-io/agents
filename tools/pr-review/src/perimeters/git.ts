import { join } from "node:path";
import { Effect } from "effect";
import { z } from "zod";
import { Change } from "../domain/change.ts";
import { HostError } from "../domain/host-error.ts";
import type { Page } from "../domain/page.ts";
import type { TargetUrl } from "../domain/target-url.ts";
import { UnknownFormat } from "../domain/unknown-format.ts";
import type { Workdir } from "../domain/workdir.ts";
import { PageCodec, TargetUrlCodec, WorkdirCodec } from "./values.ts";

interface Address {
	readonly remote: string;
	readonly base: string;
	readonly head: string;
}

interface Walked {
	readonly next: number;
	readonly lines: readonly string[];
}

const AddressShape = z.object({
	remote: z.string(),
	base: z.string(),
	head: z.string(),
});

const RANGE = /^(?<remote>.+)@(?<base>[^.]+(?:\.[^.]+)*)\.\.(?<head>[^.].*)$/u;
const FILE_START = /^(?=diff --git )/mu;
const NEW_PATH = /^\+\+\+ b\/(?<path>.+)$/mu;
const HUNK = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,\d+)? @@/u;
const FIRST_HUNK = /^@@ /mu;

const addressOf = (url: TargetUrl): Effect.Effect<Address, UnknownFormat> =>
	Effect.try({
		try: (): Address =>
			AddressShape.parse(RANGE.exec(TargetUrlCodec.encode(url))?.groups),
		catch: (): UnknownFormat => UnknownFormat.create(),
	});

const repositoryIn = (workdir: Workdir): string =>
	join(WorkdirCodec.encode(workdir), "repository.git");

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

const changeOfDiff = (url: TargetUrl, diff: string): Change =>
	Change.of(
		url,
		diff
			.split(FILE_START)
			.flatMap(pageTextOf)
			.filter((text: string): boolean => text.length > 0)
			.map((text: string): Page => PageCodec.decode(text)),
	);

const unreachableRemote = (): HostError => HostError.create();

export { addressOf, changeOfDiff, repositoryIn, unreachableRemote };
