import { Buffer } from "node:buffer";
import { join } from "node:path";
import { NoReview } from "../domain/no-review.ts";
import { type Recording, RecordingShape } from "../domain/recording.ts";
import { type Recorded, Review } from "../domain/review.ts";
import { WorkdirFailed } from "../domain/workdir-failed.ts";
import { Probe } from "../generated/domain/probe.g.ts";
import { Workdir } from "../generated/domain/workdir.g.ts";

const FILE = "review.jsonl";

const fileIn = (workdir: Workdir): string =>
	join(Workdir.codec.encode(workdir), FILE);

const fileOf = (probe: Probe): string => {
	const held = Probe.codec.encode(probe);
	const place = held.slice(held.lastIndexOf(".") + 1);

	return join(Buffer.from(place, "base64url").toString(), FILE);
};

const probeIn = (workdir: Workdir, name: string): Probe =>
	Probe.codec.decode(
		`${name}.${Buffer.from(Workdir.codec.encode(workdir)).toString("base64url")}`,
	);

const writtenReview = (review: Review): string =>
	`${JSON.stringify(Review.codec.encode(review))}\n`;

const writtenRecording = (probe: Probe, recorded: Recorded): string =>
	`${JSON.stringify(RecordingShape.encode({ probe, recorded }))}\n`;

const reviewOfText = (text: string): Review => {
	const [first = "", ...rest] = text.trimEnd().split("\n");

	return rest
		.map((line: string): Recording => RecordingShape.parse(JSON.parse(line)))
		.reduce(
			(review: Review, { probe, recorded }: Recording): Review =>
				review.after(probe, recorded),
			Review.codec.parse(JSON.parse(first)),
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
