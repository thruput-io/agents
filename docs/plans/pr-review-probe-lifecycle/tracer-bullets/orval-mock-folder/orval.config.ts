import { defineConfig } from "orval";

const SPEC = "./spec/widgets.openapi.json";
const URL = "https://widgets.example";
const MSW = [{ type: "msw" as const, delay: false as const, baseUrl: URL }];

export default defineConfig({
	tsconfigFound: {
		input: { target: SPEC },
		output: {
			target: "./src/generated/found/client/widgets.g.ts",
			client: "fetch",
			mode: "single",
			baseUrl: URL,
			mock: { path: "./src/generated/found/mocks", generators: MSW },
		},
	},
	tsconfigNamed: {
		input: { target: SPEC },
		output: {
			target: "./src/generated/named/client/widgets.g.ts",
			client: "fetch",
			mode: "single",
			baseUrl: URL,
			tsconfig: "./tsconfig.json",
			mock: { path: "./src/generated/named/mocks", generators: MSW },
		},
	},
});
