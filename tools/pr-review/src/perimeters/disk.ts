import { Buffer } from "node:buffer";
import { join } from "node:path";
import { NoReview } from "../domain/no-review.ts";
import type { Probe } from "../domain/probe.ts";
import type { Recorded, Review } from "../domain/review.ts";
import type { Workdir } from "../domain/workdir.ts";
import { WorkdirFailed } from "../domain/workdir-failed.ts";
import { StoredRecording } from "../generated/perimeters/stored-recording.g.ts";
import { StoredReview } from "../generated/perimeters/stored-review.g.ts";
import { jsonOf } from "./json.ts";
import {
	type Recording,
	RecordingCodec,
	ReviewCodec,
} from "./stored-review.ts";
import { ProbeCodec, WorkdirCodec } from "./values.ts";

const FILE = "review.jsonl";
const ReviewLine = jsonOf(StoredReview);
const RecordingLine = jsonOf(StoredRecording);

const fileIn = (workdir: Workdir): string =>
	join(WorkdirCodec.encode(workdir), FILE);

const fileOf = (probe: Probe): string => {
	const held = ProbeCodec.encode(probe);
	const place = held.slice(held.lastIndexOf(".") + 1);

	return join(Buffer.from(place, "base64url").toString(), FILE);
};

const probeIn = (workdir: Workdir, name: string): Probe =>
	ProbeCodec.decode(
		`${name}.${Buffer.from(WorkdirCodec.encode(workdir)).toString("base64url")}`,
	);

const writtenReview = (review: Review): string =>
	`${ReviewLine.encode(ReviewCodec.encode(review))}\n`;

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
			ReviewCodec.decode(ReviewLine.decode(first)),
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
