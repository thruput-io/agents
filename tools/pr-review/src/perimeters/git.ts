import { Change } from "../domain/change.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import type { TargetUrl } from "../generated/domain/target-url.g.ts";

const remoteOf = (url: TargetUrl): string => url.toJSON();

const changeOfRemote = (): Change => Change.create();

const unreachableRemote = (): HostError => HostError.create();

export { changeOfRemote, remoteOf, unreachableRemote };
