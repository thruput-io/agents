import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Effect } from "effect";
import { hostErrorFrom } from "../../domain/factory.ts";
import { changeFrom } from "../../domain/minted-review.ts";
import type { Host } from "../../domain/review.ts";
import { TargetUrlCodec } from "../../perimeters/codec.ts";

const git = promisify(execFile);

const gitHost: Host = {
	getChange: (url) =>
		Effect.tryPromise({
			try: () =>
				git("git", ["ls-remote", "--exit-code", TargetUrlCodec.encode(url)]),
			catch: () => hostErrorFrom(),
		}).pipe(Effect.map(() => changeFrom())),
	post: () => Effect.fail(hostErrorFrom()),
};

export { gitHost };
