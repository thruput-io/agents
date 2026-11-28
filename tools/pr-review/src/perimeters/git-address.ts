import { Effect } from "effect";
import { UnknownFormat } from "../domain/unknown-format.ts";
import { GitAddress } from "../generated/perimeters/git-address.g.ts";

type Groups = Readonly<Record<string, string>> | undefined;

const addressIn = (groups: Groups): Effect.Effect<GitAddress, UnknownFormat> =>
	Effect.fromNullishOr(GitAddress.safeParse(groups).data).pipe(
		Effect.mapError((): UnknownFormat => UnknownFormat.create()),
	);

export { addressIn };
