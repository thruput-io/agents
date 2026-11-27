import { Effect } from "effect";
import { z } from "zod";
import type { Probes } from "../domain/task.ts";
import { Term } from "../domain/term.ts";
import { Verdict } from "../domain/verdict.ts";
import { Acknowledgement } from "../generated/domain/acknowledgement.g.ts";
import { NotValid } from "../generated/domain/not-valid.g.ts";
import { Probe } from "../generated/domain/probe.g.ts";
import { Rule } from "../generated/domain/rule.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";
import {
	prepareArguments,
	statusArguments,
} from "../generated/perimeters/main-arguments.g.ts";
import {
	ackArguments,
	defineArguments,
	instructionsArguments,
	nextArguments,
	prevArguments,
	reportArguments,
	rulesArguments,
} from "../generated/perimeters/sub-arguments.g.ts";
import { probesIn } from "./rulebook.ts";

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

interface Decoding<Value> {
	readonly parse: (text: string) => Value;
}

const CommandLineShape = z.tuple([z.string()]).rest(z.string());

const parsedBy = <Shape>(
	shape: z.ZodType<Shape>,
	given: readonly string[],
): Effect.Effect<Shape, NotValid> =>
	Effect.try({
		try: (): Shape => shape.parse(given),
		catch: (): NotValid => NotValid.create(),
	});

const decoded = <Value>(
	codec: Decoding<Value>,
	text: string,
): Effect.Effect<Value, NotValid> =>
	Effect.try({
		try: (): Value => codec.parse(text),
		catch: (): NotValid => NotValid.create(),
	});

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
	parsedBy(prepareArguments, commandArguments).pipe(
		Effect.flatMap(
			([url, workdir]: [string, string]): Effect.Effect<
				PrepareCommand,
				NotValid
			> =>
				Effect.all({
					url: decoded(TargetUrl.codec, url),
					workdir: decoded(Workdir.codec, workdir),
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
	parsedBy(statusArguments, commandArguments).pipe(
		Effect.flatMap(
			([workdir]: [string]): Effect.Effect<Workdir, NotValid> =>
				decoded(Workdir.codec, workdir),
		),
	);

const probeCommandBy =
	(shape: z.ZodType<[string]>) =>
	(commandArguments: readonly string[]): Effect.Effect<Probe, NotValid> =>
		parsedBy(shape, commandArguments).pipe(
			Effect.flatMap(
				([probe]: [string]): Effect.Effect<Probe, NotValid> =>
					decoded(Probe.codec, probe),
			),
		);

const instructionsCommandOf = probeCommandBy(instructionsArguments);
const rulesCommandOf = probeCommandBy(rulesArguments);
const nextCommandOf = probeCommandBy(nextArguments);
const prevCommandOf = probeCommandBy(prevArguments);

const defineCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<DefineCommand, NotValid> =>
	parsedBy(defineArguments, commandArguments).pipe(
		Effect.flatMap(
			([probe, term]: [string, string]): Effect.Effect<
				DefineCommand,
				NotValid
			> =>
				Effect.all({
					probe: decoded(Probe.codec, probe),
					term: decoded(Term.codec, term),
				}),
		),
	);

const ackCommandOf = (
	commandArguments: readonly string[],
): Effect.Effect<AckCommand, NotValid> =>
	parsedBy(ackArguments, commandArguments).pipe(
		Effect.flatMap(
			([probe, sent]: [string, string]): Effect.Effect<AckCommand, NotValid> =>
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
	parsedBy(reportArguments, commandArguments).pipe(
		Effect.flatMap(
			([probe, rule]: [string, string]): Effect.Effect<
				ReportCommand,
				NotValid
			> =>
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
