import { faker } from "@faker-js/faker";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { createAzureHandlers } from "./azure-mocks.ts";
import { createGitHubHandlers } from "./github-mocks.ts";
import type { ScenarioRepo } from "./scenario-repo.ts";

faker.seed(42);

export const mockServer = setupServer();

const createRulesetTextHandler = () =>
	http.get(
		"https://raw.githubusercontent.com/ciembor/agent-rules-books/*",
		() => HttpResponse.text("# Book Rules\n\n## R1\n\n## R2\n\n## R3\n"),
	);

export const resetHostMocks = (repo: ScenarioRepo): void => {
	mockServer.resetHandlers(
		createRulesetTextHandler(),
		...createGitHubHandlers(repo),
		...createAzureHandlers(repo),
	);
};

export const scenarioToken = "test-token";
