import type { z } from "zod";
import { HostError } from "../domain/host-error.ts";
import type { Post } from "../domain/post.ts";
import { Posted } from "../domain/posted.ts";
import type { ReviewStatus } from "../domain/review.ts";
import type { Rule } from "../domain/rule.ts";
import type { Workdir } from "../domain/workdir.ts";
import type { Status200Response } from "../generated/perimeters/review-tool.g.ts";
import { RuleCodec } from "./values.ts";
import { sessionOf } from "./workdir.ts";

type Status = z.infer<typeof Status200Response>;

const statusAnswer =
	(workdir: Workdir) =>
	({ remaining, posts }: ReviewStatus): Status => ({
		...sessionOf(workdir),
		remaining: remaining.map((rule: Rule): string => RuleCodec.encode(rule)),
		posted: posts.some((post: Post): boolean => post instanceof Posted),
		postFailed: posts.some((post: Post): boolean => post instanceof HostError),
	});

export { statusAnswer };
