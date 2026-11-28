export default {
	probe: {
		input: {
			target: "./openapi.json",
			parserOptions: { externalRefs: { allow: ["domain.schema.json"] } },
		},
		output: {
			client: "zod",
			mode: "single",
			target: "./generated/review-tool-probe.g.ts",
			override: { zod: { version: 4, generateEachHttpStatus: true } },
		},
	},
};
