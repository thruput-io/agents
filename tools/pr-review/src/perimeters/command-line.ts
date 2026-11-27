import { Effect } from "effect";
import { z } from "zod";
import type { NotValid } from "../domain/not-valid.ts";
import type { Probes } from "../domain/task.ts";
import type { Term } from "../domain/term.ts";
import { Verdict } from "../domain/verdict.ts";
import type { Workdir } from "../domain/workdir.ts";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { Probe } from "../generated/domain/probe.g.ts";
import { Rule } from "../generated/domain/rule.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import {
	PrepareParams,
	StatusParams,
} from "../generated/perimeters/review-tool.g.ts";
import {
	AckParams,
	DefineParams,
	InstructionsParams,
	NextParams,
	PrevParams,
	ReportParams,
	RulesParams,
} from "../generated/perimeters/review-tool-probe.g.ts";
import { WorkdirCodec } from "../perimeters/workdir.ts";
import { decoded, namedBy, parsedBy } from "./parsing.ts";
import { probesIn } from "./rulebook.ts";
import { TermCodec } from "./term.ts";

interface CommandLine {
	readonly name: string;
	readonly commandArguments: readonly string[];
}

interface PrepareCommand {
	readonly url: TargetUrl;
	readonly workdir: Workdir;
	readonly probes: Probes;
}

interface DefineCommand {
	readonly probe: Probe;
	readonly term: Term;
}

interface AckCommand {
	readonly probe: Probe;
	readonly sent: Effect.Effect<Acknowledgement, NotValid>;
}

interface ReportCommand {
	readonly probe: Probe;
	readonly verdict: Verdict;
}

const CommandLineShape = z.tuple([z.string()]).rest(z.string());

const commandLineOf = (
	given: readonly string[],
): Effect.Effect<CommandLine, NotValid> =>
	parsedBy(CommandLineShape, given).pipe(
		Effect.map(
			([name, ...commandArguments]: [string, ...string[]]): CommandLine => ({
				name,
				commandArguments,
			}),
		),
	);

const prepareCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<PrepareCommand, NotValid> =>
	namedBy(PrepareParams, commandArguments).pipe(
		Effect.flatMap(
			({ url, workdir }): Effect.Effect<PrepareCommand, NotValid> =>
				Effect.all({
					url: decoded(TargetUrl.codec, url),
					workdir: decoded(WorkdirCodec, workdir),
				}).pipe(
					Effect.map(
						(given): PrepareCommand => ({
							...given,
							probes: probesIn(given.workdir),
						}),
					),
				),
		),
	);

const statusCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<Workdir, NotValid> =>
	namedBy(StatusParams, commandArguments).pipe(
		Effect.flatMap(
			({ workdir }): Effect.Effect<Workdir, NotValid> =>
				decoded(WorkdirCodec, workdir),
		),
	);

const probeCommandBy =
	(shape: typeof RulesParams) =>
	(commandArguments: readonly string[]): Effect.Effect<Probe, NotValid> =>
		namedBy(shape, commandArguments).pipe(
			Effect.flatMap(
				({ probe }): Effect.Effect<Probe, NotValid> =>
					decoded(Probe.codec, probe),
			),
		);

const instructionsCommandOf = probeCommandBy(InstructionsParams);
const rulesCommandOf = probeCommandBy(RulesParams);
const nextCommandOf = probeCommandBy(NextParams);
const prevCommandOf = probeCommandBy(PrevParams);

const defineCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<DefineCommand, NotValid> =>
	namedBy(DefineParams, commandArguments).pipe(
		Effect.flatMap(
			({ probe, term }): Effect.Effect<DefineCommand, NotValid> =>
				Effect.all({
					probe: decoded(Probe.codec, probe),
					term: decoded(TermCodec, term),
				}),
		),
	);

const ackCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<AckCommand, NotValid> =>
	namedBy(AckParams, commandArguments).pipe(
		Effect.flatMap(
			({ probe, acknowledgement: sent }): Effect.Effect<AckCommand, NotValid> =>
				Effect.map(
					decoded(Probe.codec, probe),
					(holder: Probe): AckCommand => ({
						probe: holder,
						sent: decoded(Acknowledgement.codec, sent),
					}),
				),
		),
	);

const reportCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<ReportCommand, NotValid> =>
	namedBy(ReportParams, commandArguments).pipe(
		Effect.flatMap(
			({ probe, rule }): Effect.Effect<ReportCommand, NotValid> =>
				Effect.all({
					probe: decoded(Probe.codec, probe),
					verdict: Effect.map(decoded(Rule.codec, rule), Verdict.on),
				}),
		),
	);

export type { CommandLine };
export {
	ackCommandOf,
	commandLineOf,
	defineCommandOf,
	instructionsCommandOf,
	nextCommandOf,
	prepareCommandOf,
	prevCommandOf,
	reportCommandOf,
	rulesCommandOf,
	statusCommandOf,
};
