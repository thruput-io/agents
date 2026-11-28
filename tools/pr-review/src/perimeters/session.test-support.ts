import { Buffer } from "node:buffer";
import type { Session } from "../domain/session.ts";
import { statusDto } from "./session.ts";

const sessionAt = (directory: string): Session =>
	statusDto({
		session: Buffer.from(
			JSON.stringify({
				session: "00000000-0000-4000-8000-000000000000",
				directory,
			}),
		).toString("base64url"),
	}).toDomain();

export { sessionAt };
