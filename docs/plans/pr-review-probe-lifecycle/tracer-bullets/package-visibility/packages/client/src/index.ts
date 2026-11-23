import { assign } from "@bullet/controller";
import {
	AssignmentCodec,
	ChangeCodec,
	ProbeCodec,
} from "@bullet/core/perimeters";

const assignFromWire = (wireChange: unknown, wireProbe: unknown) =>
	AssignmentCodec.encode(
		assign(ChangeCodec.parse(wireChange), ProbeCodec.parse(wireProbe)),
	);

export { assignFromWire };
