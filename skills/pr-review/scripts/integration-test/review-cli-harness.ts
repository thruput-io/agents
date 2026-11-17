import { rmSync } from "node:fs";
import { after, before, beforeEach } from "node:test";
import {
	resetHostMocks,
	scenarioToken,
	startMockBridge,
	stopMockBridge,
} from "./mock-server.ts";
import { createScenarioRepo, type ScenarioRepo } from "./scenario-repo.ts";

const setupReviewCliHarness = (): ScenarioRepo => {
	const repo = createScenarioRepo();

	before(async () => {
		await startMockBridge();
	});

	beforeEach(() => {
		resetHostMocks(repo);
	});

	after(async () => {
		await stopMockBridge();
		rmSync(repo.rootDir, { recursive: true, force: true });
	});

	return repo;
};

export { scenarioToken, setupReviewCliHarness };
