import { Match } from "effect";
import { z } from "zod";
import { Acknowledgement } from "../domain/acknowledgement.ts";
import { Back } from "../domain/back.ts";
import { Change } from "../domain/change.ts";
import { Forward } from "../domain/forward.ts";
import { HostError } from "../domain/host-error.ts";
import { Page } from "../domain/page.ts";
import { Posted } from "../domain/posted.ts";
import { Probe } from "../domain/probe.ts";
import type { Recorded, Review } from "../domain/review.ts";
import { TargetUrl } from "../domain/target-url.ts";
import type { Probes } from "../domain/task.ts";
import { Verdict } from "../domain/verdict.ts";
import { StoredRecording } from "../generated/perimeters/stored-recording.g.ts";
import type { StoredStart } from "../generated/perimeters/stored-start.g.ts";
import {
	storedTask,
	storedVerdict,
	taskFrom,
	verdictFrom,
} from "./stored-task.ts";
import {
	AcknowledgementCodec,
	PageCodec,
	ProbeCodec,
	TargetUrlCodec,
} from "./values.ts";

type StoredRecorded = StoredRecording["recorded"];

interface Recording {
	readonly probe: Probe;
	readonly recorded: Recorded;
}

const isPosted = (given: Recorded): given is Posted => given instanceof Posted;
const isHostError = (given: Recorded): given is HostError =>
	given instanceof HostError;
const isForward = (given: Recorded): given is Forward =>
	given instanceof Forward;
const isBack = (given: Recorded): given is Back => given instanceof Back;
const isVerdict = (given: Recorded): given is Verdict =>
	given instanceof Verdict;
const isAcknowledgement = (given: Recorded): given is Acknowledgement =>
	given instanceof Acknowledgement;

const recordedFrom = (stored: StoredRecorded): Recorded =>
	Match.value(stored).pipe(
		Match.when("forward", (): Recorded => Forward.create()),
		Match.when("back", (): Recorded => Back.create()),
		Match.when("posted", (): Recorded => Posted.create()),
		Match.when("host-error", (): Recorded => HostError.create()),
		Match.when(
			{ acknowledgement: Match.string },
			({ acknowledgement }): Recorded => Acknowledgement.of(acknowledgement),
		),
		Match.when(
			{ verdict: Match.defined },
			({ verdict }): Recorded => verdictFrom(verdict),
		),
		Match.exhaustive,
	);

const storedRecorded = (recorded: Recorded): StoredRecorded =>
	Match.value(recorded).pipe(
		Match.when(isForward, (): StoredRecorded => "forward"),
		Match.when(isBack, (): StoredRecorded => "back"),
		Match.when(isPosted, (): StoredRecorded => "posted"),
		Match.when(isHostError, (): StoredRecorded => "host-error"),
		Match.when(
			isAcknowledgement,
			(sent: Acknowledgement): StoredRecorded => ({
				acknowledgement: AcknowledgementCodec.encode(sent),
			}),
		),
		Match.when(
			isVerdict,
			(verdict: Verdict): StoredRecorded => ({
				verdict: storedVerdict(verdict),
			}),
		),
		Match.exhaustive,
	);

const startedFrom = ({ url, pages, tasks }: StoredStart): Review =>
	Change.of(TargetUrl.of(url), pages.map(Page.of)).review(tasks.map(taskFrom));

const storedStart = (review: Review): StoredStart =>
	review.started(
		(url: TargetUrl, pages: readonly Page[], probes: Probes): StoredStart => ({
			url: TargetUrlCodec.encode(url),
			pages: pages.map((page: Page): string => PageCodec.encode(page)),
			tasks: probes.map(storedTask),
		}),
	);

const RecordingCodec = z.codec(StoredRecording, z.custom<Recording>(), {
	decode: ({ probe, recorded }: StoredRecording): Recording => ({
		probe: Probe.of(probe),
		recorded: recordedFrom(recorded),
	}),
	encode: ({ probe, recorded }: Recording): StoredRecording => ({
		probe: ProbeCodec.encode(probe),
		recorded: storedRecorded(recorded),
	}),
});

export type { Recording };
export { RecordingCodec, startedFrom, storedStart };
