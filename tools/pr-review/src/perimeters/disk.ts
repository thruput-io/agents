import { Buffer } from "node:buffer";
import { join } from "node:path";
import { NoReview } from "../domain/no-review.ts";
import type { Probe } from "../domain/probe.ts";
import type { Recorded, Review } from "../domain/review.ts";
import type { Workdir } from "../domain/workdir.ts";
import { WorkdirFailed } from "../domain/workdir-failed.ts";
import { StoredRecording } from "../generated/perimeters/stored-recording.g.ts";
import { StoredStart } from "../generated/perimeters/stored-start.g.ts";
import { jsonOf } from "./json.ts";
import {
	type Recording,
	RecordingCodec,
	startedFrom,
	storedStart,
} from "./stored-review.ts";
import { ProbeCodec } from "./values.ts";
import { placeOf } from "./workdir.ts";

const FILE = "review.jsonl";
const StartLine = jsonOf(StoredStart);
const RecordingLine = jsonOf(StoredRecording);

const fileIn = (workdir: Workdir): string =>
	join(placeOf(workdir).directory, FILE);

const fileOf = (probe: Probe): string => {
	const held = ProbeCodec.encode(probe);
	const place = held.slice(held.lastIndexOf(".") + 1);

	return join(Buffer.from(place, "base64url").toString(), FILE);
};

const probeIn = (workdir: Workdir, name: string): Probe =>
	ProbeCodec.decode(
		`${name}.${Buffer.from(placeOf(workdir).directory).toString("base64url")}`,
	);

const writtenReview = (review: Review): string =>
	`${StartLine.encode(storedStart(review))}\n`;

const writtenRecording = (probe: Probe, recorded: Recorded): string =>
	`${RecordingLine.encode(RecordingCodec.encode({ probe, recorded }))}\n`;

const reviewOfText = (text: string): Review => {
	const [first = "", ...rest] = text.trimEnd().split("\n");

	return rest
		.map(
			(line: string): Recording =>
				RecordingCodec.decode(RecordingLine.decode(line)),
		)
		.reduce(
			(review: Review, { probe, recorded }: Recording): Review =>
				review.after(probe, recorded),
			startedFrom(StartLine.decode(first)),
		);
};

const nothingStored = (): NoReview => NoReview.create();

const notWritable = (): WorkdirFailed => WorkdirFailed.create();

export {
	fileIn,
	fileOf,
	nothingStored,
	notWritable,
	probeIn,
	reviewOfText,
	writtenRecording,
	writtenReview,
};
