import { ChangeCodec } from "@bullet/core/perimeters";

const parsesInTheController = (wire: unknown): boolean =>
	ChangeCodec.safeParse(wire).success;

export { parsesInTheController };
