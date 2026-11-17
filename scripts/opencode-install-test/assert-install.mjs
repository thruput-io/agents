import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const plugins = JSON.parse(process.env.PLUGINS_JSON);
const skills = JSON.parse(process.env.SKILLS_JSON);

const loadedPlugins = plugins.data.map((plugin) => ({
	id: plugin.id,
	status: plugin.state.status,
}));

const targetSkills = new Set(["dad-joke", "pr-review"]);
const installedSkills = skills.data
	.map((skill) => skill.id)
	.filter((id) => targetSkills.has(id))
	.sort();

const reviewTool = spawnSync("review-tool", ["--help"], { encoding: "utf8" });
const reviewToolProbe = spawnSync("review-tool-probe", ["--help"], {
	encoding: "utf8",
});

assert.deepEqual(
	{
		loadedPlugins,
		installedSkills,
		reviewToolExitStatus: reviewTool.status,
		reviewToolProbeExitStatus: reviewToolProbe.status,
	},
	{
		loadedPlugins: [{ id: "thruput", status: "active" }],
		installedSkills: ["dad-joke", "pr-review"],
		reviewToolExitStatus: 0,
		reviewToolProbeExitStatus: 0,
	},
);
