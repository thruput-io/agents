import { join } from "node:path";
import type { Effect } from "effect";
import type { TargetUrl } from "../../domain/target-url.ts";
import type { UnknownFormat } from "../../domain/unknown-format.ts";
import type { Workdir } from "../../domain/workdir.ts";
import type { GitAddress } from "../../generated/perimeters/git-address.g.ts";
import { addressIn } from "../../perimeters/git-address.ts";
import { TargetUrlCodec } from "../../perimeters/values.ts";
import { paramsOf } from "../../perimeters/workdir.ts";

const RANGE = /^(?<remote>.+)@(?<base>[^.]+(?:\.[^.]+)*)\.\.(?<head>[^.].*)$/u;

const addressOf = (url: TargetUrl): Effect.Effect<GitAddress, UnknownFormat> =>
	addressIn(RANGE.exec(TargetUrlCodec.encode(url))?.groups);

const repositoryIn = (workdir: Workdir): string =>
	join(paramsOf(workdir).workdir, "repository.git");

export { addressOf, repositoryIn };
