import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import type { z } from "zod";
import { type Checkout, CheckoutSchema } from "./contracts.g.ts";

export class SnapshotDirectory {
	readonly #path: Checkout;
	private constructor(path: Checkout) {
		this.#path = path;
	}
	static readonly Schema = CheckoutSchema.transform(
		(path) => new SnapshotDirectory(path),
	);
	static from(raw: Checkout): z.ZodSafeParseResult<SnapshotDirectory> {
		return SnapshotDirectory.Schema.safeParse(raw);
	}
	gitRaw(args: readonly string[]): string {
		mkdirSync(this.#path, { recursive: true });
		return execFileSync("git", ["-C", this.#path, ...args], {
			encoding: "utf8",
		});
	}
	git(args: readonly string[]): string {
		return this.gitRaw(args).trimEnd();
	}
	equals(other: SnapshotDirectory): boolean {
		return this.#path === other.#path;
	}
	toString(): Checkout {
		return this.#path;
	}
}
