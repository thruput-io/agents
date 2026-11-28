const purposeRules: readonly string[] = [
	"Stated purpose",
	"Every part solves the Purpose",
	"Predictable user-facing behavior",
	"No speculative portability",
	"Keep pull requests small",
	"Make it work first",
];

const purposeRulesAfterTheFirst: readonly string[] = purposeRules.slice(1);

export { purposeRules, purposeRulesAfterTheFirst };
