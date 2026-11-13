import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nonnull } from "../domain/nullish.ts";
import { Workdir } from "../domain/workdir.ts";

export interface ScenarioRepo {
	readonly rootDir: string;
	readonly repoDir: string;
	readonly baseCommit: string;
	readonly headCommit: string;
	readonly headCommitV2: string;
	readonly zipForCommit: (commit: string, prefix?: string) => Blob;
	readonly gitTarget: string;
	readonly gitLargeTarget: string;
	readonly gitLargeDiffTarget: string;
	readonly githubTarget: string;
	readonly azureTarget: string;
	readonly workdirFor: (label: string) => Workdir;
}

export function createScenarioRepo(): ScenarioRepo {
	const rootDir = mkdtempSync(join(tmpdir(), "pr-review-it-"));
	const repoDir = join(rootDir, "repo");
	const gitEnv = {
		...process.env,
		GIT_AUTHOR_EMAIL: "author@example.com",
		GIT_AUTHOR_NAME: "Author",
		GIT_COMMITTER_EMAIL: "author@example.com",
		GIT_COMMITTER_NAME: "Author",
	};
	const git = (args: readonly string[]) =>
		execFileSync("git", args, {
			cwd: repoDir,
			encoding: "utf8",
			env: gitEnv,
		}).trim();
	execFileSync("git", ["init", "--quiet", "--initial-branch=main", repoDir]);
	git(["config", "user.email", "author@example.com"]);
	git(["config", "user.name", "Author"]);
	writeFileSync(join(repoDir, "service.ts"), "export const x = 1;\n\n", "utf8");
	writeFileSync(join(repoDir, "empty.txt"), "", "utf8");
	git(["add", "service.ts", "empty.txt"]);
	git(["commit", "--quiet", "-m", "Initial main commit"]);
	const baseCommit = git(["rev-parse", "HEAD"]);

	git(["checkout", "--quiet", "-b", "feature"]);
	writeFileSync(
		join(repoDir, "service.ts"),
		"export const x = 1;\nexport const y = 2;\n\n",
		"utf8",
	);
	chmodSync(join(repoDir, "empty.txt"), 0o755);
	git(["add", "service.ts", "empty.txt"]);
	git(["commit", "--quiet", "-m", "Add y export\n\nFirst body."]);
	writeFileSync(join(repoDir, "helper.ts"), "export const z = 3;\n\n", "utf8");
	git(["add", "helper.ts"]);
	git(["commit", "--quiet", "-m", "Refine helper\n\nSecond body."]);
	const headCommit = git(["rev-parse", "HEAD"]);

	git(["checkout", "--quiet", "-b", "feature-v2"]);
	writeFileSync(join(repoDir, "helper.ts"), "export const z = 4;\n\n", "utf8");
	git(["add", "helper.ts"]);
	git(["commit", "--quiet", "-m", "Update helper in v2"]);
	const headCommitV2 = git(["rev-parse", "HEAD"]);

	git(["checkout", "--quiet", "main"]);
	writeFileSync(
		join(repoDir, "main-only.ts"),
		"export const mainOnly = true;\n",
		"utf8",
	);
	git(["add", "main-only.ts"]);
	git(["commit", "--quiet", "-m", "Divergent main commit"]);

	git(["checkout", "--quiet", "-b", "feature-large"]);
	const manyLines = Array.from(
		{ length: 1005 },
		(_, idx) => `export const line${idx} = ${idx};`,
	).join("\n");
	writeFileSync(join(repoDir, "large-prod.ts"), `${manyLines}\n`, "utf8");
	writeFileSync(join(repoDir, "large.test.ts"), `${manyLines}\n`, "utf8");
	writeFileSync(join(repoDir, "package-lock.json"), `${manyLines}\n`, "utf8");
	writeFileSync(join(repoDir, "README.md"), `${manyLines}\n`, "utf8");
	git([
		"add",
		"large-prod.ts",
		"large.test.ts",
		"package-lock.json",
		"README.md",
	]);
	git(["commit", "--quiet", "-m", "Oversized change"]);

	git(["checkout", "--quiet", "main"]);
	git(["checkout", "--quiet", "-b", "feature-large-diff"]);
	const mediumLines = Array.from(
		{ length: 550 },
		(_, idx) => `export const item${idx} = ${idx};`,
	).join("\n");
	mkdirSync(join(repoDir, "docs"), { recursive: true });
	writeFileSync(join(repoDir, "part-a.ts"), `${mediumLines}\n`, "utf8");
	writeFileSync(join(repoDir, "part-b.ts"), `${mediumLines}\n`, "utf8");
	writeFileSync(join(repoDir, "part-c.ts"), `${mediumLines}\n`, "utf8");
	writeFileSync(join(repoDir, "docs/spec.yaml"), `${manyLines}\n`, "utf8");
	git(["add", "part-a.ts", "part-b.ts", "part-c.ts", "docs/spec.yaml"]);
	git(["commit", "--quiet", "-m", "Oversized total diff"]);

	git(["checkout", "--quiet", "feature"]);
	const zipForCommit = (commit: string, prefix = ""): Blob => {
		const prefixArgs = prefix.length > 0 ? [`--prefix=${prefix}`] : [];
		const bytes = execFileSync(
			"git",
			["archive", "--format=zip", ...prefixArgs, commit],
			{ cwd: repoDir },
		);
		return new Blob([bytes], { type: "application/zip" });
	};

	return {
		rootDir,
		repoDir,
		baseCommit,
		headCommit,
		headCommitV2,
		zipForCommit,
		gitTarget: `${repoDir}@main..feature`,
		gitLargeTarget: `${repoDir}@main..feature-large`,
		gitLargeDiffTarget: `${repoDir}@main..feature-large-diff`,
		githubTarget: "https://github.com/octocat/hello-world/pull/42",
		azureTarget: "https://dev.azure.com/org/proj/_git/repo/pullrequest/42",
		workdirFor: (label: string) =>
			nonnull(Workdir.from(join(rootDir, label, "workspace")).data),
	};
}
