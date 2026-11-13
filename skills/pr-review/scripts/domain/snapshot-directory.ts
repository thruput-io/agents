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

export interface CommitZipArchive {
	readonly sha: string;
	readonly zip: Blob;
}

export class SnapshotDirectory {
	readonly #path: Checkout;
	private constructor(path: Checkout) {
		this.#path = path;
	}
	static readonly Schema = z.codec(
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
		return SnapshotDirectory.Schema.safeDecode(raw);
	}
	gitRaw(args: readonly string[]): string {
		mkdirSync(this.#path, { recursive: true });
		return execFileSync("git", ["-C", this.#path, ...args], {
			encoding: "utf8",
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		});
	}
	git(args: readonly string[]): string {
		return this.gitRaw(args).trimEnd();
	}
	clone(remoteUrl: RepositoryPath): void {
		if (existsSync(join(this.#path, ".git"))) {
			return;
		}
		this.git(["clone", "--quiet", "--no-tags", remoteUrl, "."]);
	}
	async loadCommitZips(
		commits: readonly CommitZipArchive[],
		stripTopLevelDir: boolean,
	): Promise<void> {
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
				mkdirSync(extractDir, { recursive: true });
				writeFileSync(archivePath, bytes);
				execFileSync("unzip", ["-q", archivePath, "-d", extractDir]);
				const topEntries = readdirSync(extractDir);
				const sourceRoot =
					stripTopLevelDir && topEntries.length === 1
						? join(extractDir, nonnull(topEntries[0]))
						: extractDir;
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
	diff(fromCommit: string, toCommit: string): string {
		const refOf = (sha: string) =>
			existsSync(join(this.#path, ".git", "refs", "snapshots", sha))
				? `refs/snapshots/${sha}`
				: sha;
		return this.git([
			"diff",
			"--no-renames",
			"--unified=0",
			`${refOf(fromCommit)}..${refOf(toCommit)}`,
		]);
	}
	resolveRef(ref: string): string {
		const target = COMMIT_SHA_PATTERN.test(ref)
			? ref
			: `refs/remotes/origin/${ref.replace(HEADS_PREFIX, "")}`;
		return this.git(["rev-parse", target]).trim();
	}
	readTextFile(relativePath: Path): string | null {
		const fullPath = join(this.#path, relativePath);
		if (!(existsSync(fullPath) && statSync(fullPath).isFile())) {
			return null;
		}
		const raw = readFileSync(fullPath);
		return raw.includes(0) ? null : raw.toString("utf8");
	}
	equals(other: SnapshotDirectory): boolean {
		return this.#path === other.#path;
	}
	toString(): Checkout {
		return this.#path;
	}
}
