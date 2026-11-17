import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { z } from "zod";
import {
	type Checkout,
	CheckoutSchema,
	type Path,
	type RepositoryPath,
} from "./contracts.g.ts";
import { nonnull } from "./nullish.ts";

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const HEADS_PREFIX = /^refs\/heads\//u;
const MAX_GIT_STDOUT_BYTES = 4_194_304;
const GIT_TERMINAL_PROMPT_ENV = "GIT_TERMINAL_PROMPT";

export interface CommitZipArchive {
	readonly sha: string;
	readonly zip: Blob;
}

export class SnapshotDirectory {
	readonly #path: Checkout;
	private constructor(path: Checkout) {
		this.#path = path;
	}
	static readonly SCHEMA = z.codec(
		CheckoutSchema,
		z.custom<SnapshotDirectory>(
			(val): val is SnapshotDirectory => val instanceof SnapshotDirectory,
		),
		{
			decode: (path) => new SnapshotDirectory(path),
			encode: (dir) => dir.toString(),
		},
	);
	static from(raw: Checkout): z.ZodSafeParseResult<SnapshotDirectory> {
		return SnapshotDirectory.SCHEMA.safeDecode(raw);
	}
	#resetDirectory(): void {
		rmSync(this.#path, { recursive: true, force: true });
		mkdirSync(this.#path, { recursive: true });
	}
	gitRaw(args: readonly string[]): string {
		return execFileSync("git", ["-C", this.#path, ...args], {
			encoding: "utf8",
			maxBuffer: MAX_GIT_STDOUT_BYTES,
			env: { ...env, [GIT_TERMINAL_PROMPT_ENV]: "0" },
		});
	}
	git(args: readonly string[]): string {
		return this.gitRaw(args).trimEnd();
	}
	clone(remoteUrl: RepositoryPath): void {
		this.#resetDirectory();
		this.git(["clone", "--quiet", "--no-tags", remoteUrl, "."]);
	}
	async loadCommitZips(
		commits: readonly CommitZipArchive[],
		stripTopLevelDir: boolean,
	): Promise<void> {
		this.#resetDirectory();
		this.git(["init", "--quiet"]);
		this.git(["config", "user.email", "pr-review@local"]);
		this.git(["config", "user.name", "pr-review"]);
		const unpacked = await Promise.all(
			commits.map(async ({ sha, zip }) => ({
				sha,
				bytes: new Uint8Array(await zip.arrayBuffer()),
			})),
		);
		for (const { sha, bytes } of unpacked) {
			for (const entry of readdirSync(this.#path)) {
				if (entry !== ".git") {
					rmSync(join(this.#path, entry), { recursive: true, force: true });
				}
			}
			const tempDir = mkdtempSync(join(tmpdir(), "pr-review-zip-"));
			try {
				const archivePath = join(tempDir, "archive.zip");
				const extractDir = join(tempDir, "extracted");
				rmSync(extractDir, { recursive: true, force: true });
				mkdirSync(extractDir, { recursive: true });
				writeFileSync(archivePath, bytes);
				execFileSync("unzip", ["-q", archivePath, "-d", extractDir]);
				const topEntries = readdirSync(extractDir);
				let sourceRoot = extractDir;
				if (stripTopLevelDir && topEntries.length === 1) {
					sourceRoot = join(extractDir, nonnull(topEntries[0]));
				}
				for (const item of readdirSync(sourceRoot)) {
					cpSync(join(sourceRoot, item), join(this.#path, item), {
						recursive: true,
					});
				}
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
			this.git(["add", "--all", "--force"]);
			this.git(["commit", "--quiet", "--allow-empty", "-m", sha]);
			this.git(["update-ref", `refs/snapshots/${sha}`, "HEAD"]);
		}
	}
	#refOf(sha: string): string {
		if (existsSync(join(this.#path, ".git", "refs", "snapshots", sha))) {
			return `refs/snapshots/${sha}`;
		}
		return sha;
	}
	numstat(fromCommit: string, toCommit: string): string {
		return this.git([
			"diff",
			"--numstat",
			"--no-renames",
			`${this.#refOf(fromCommit)}..${this.#refOf(toCommit)}`,
		]);
	}
	diff(fromCommit: string, toCommit: string): string {
		return this.git([
			"diff",
			"--no-renames",
			"--unified=0",
			`${this.#refOf(fromCommit)}..${this.#refOf(toCommit)}`,
		]);
	}
	resolveRef(ref: string): string {
		let target = `refs/remotes/origin/${ref.replace(HEADS_PREFIX, "")}`;
		if (COMMIT_SHA_PATTERN.test(ref)) {
			target = ref;
		}
		return this.git(["rev-parse", target]).trim();
	}
	readTextFile(relativePath: Path): string | null {
		const fullPath = join(this.#path, relativePath);
		if (!(existsSync(fullPath) && statSync(fullPath).isFile())) {
			return null;
		}
		const raw = readFileSync(fullPath);
		if (raw.includes(0)) {
			return null;
		}
		return raw.toString("utf8");
	}
	equals(other: SnapshotDirectory): boolean {
		return this.#path === other.#path;
	}
	toString(): Checkout {
		return this.#path;
	}
}
