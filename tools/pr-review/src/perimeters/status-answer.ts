import type { z } from "zod";
import { HostError } from "../domain/host-error.ts";
import type { Post } from "../domain/post.ts";
import { Posted } from "../domain/posted.ts";
import type { ReviewStatus } from "../domain/review.ts";
import type { Rule } from "../domain/rule.ts";
import type { Session } from "../domain/session.ts";
import type { Status200Response } from "../generated/perimeters/review-tool.g.ts";
import { askedOf } from "./session.ts";
import { RuleCodec } from "./values.ts";

type Status = z.infer<typeof Status200Response>;

const statusAnswer =
	(workdir: Session) =>
	({ remaining, posts }: ReviewStatus): Status => ({
		...askedOf(workdir),
		remaining: remaining.map((rule: Rule): string => RuleCodec.encode(rule)),
		posted: posts.some((post: Post): boolean => post instanceof Posted),
		postFailed: posts.some((post: Post): boolean => post instanceof HostError),
	});

export { statusAnswer };
