import { Match } from "effect";
import { z } from "zod";
import { HostError } from "../generated/domain/host-error.g.ts";
import { Posted } from "../generated/domain/posted.g.ts";

type Post = Posted | HostError;
const POSTS = {
	posted: (): Post => Posted.create(),
	"host-error": (): Post => HostError.create(),
};

const PostShape = z.codec(
	z.enum(["posted", "host-error"]),
	z.custom<Post>(
		(value): boolean => value instanceof Posted || value instanceof HostError,
	),
	{
		decode: (name: keyof typeof POSTS): Post => POSTS[name](),
		encode: (post: Post): keyof typeof POSTS =>
			Match.value(post).pipe(
				Match.when(
					(given: Post): given is Posted => given instanceof Posted,
					(): keyof typeof POSTS => "posted",
				),
				Match.when(
					(given: Post): given is HostError => given instanceof HostError,
					(): keyof typeof POSTS => "host-error",
				),
				Match.exhaustive,
			),
	},
);

export type { Post };
export { PostShape };
