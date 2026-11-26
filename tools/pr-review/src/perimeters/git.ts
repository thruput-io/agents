import { Change } from "../domain/change.ts";
import { HostError } from "../generated/domain/host-error.g.ts";
import { TargetUrl } from "../generated/domain/target-url.g.ts";

const remoteOf = (url: TargetUrl): string => TargetUrl.codec.encode(url);

const changeOfRemote = (url: TargetUrl): Change => Change.of(url, []);

const unreachableRemote = (): HostError => HostError.create();

export { changeOfRemote, remoteOf, unreachableRemote };
