import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectFiles, type Violation } from "archunit";

const TSCONFIG_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../tsconfig.json",
);

const DOMAIN = "src/domain/**,src/generated/domain/**";
const PERIMETERS = `src/perimeters/**,src/generated/perimeters/**,${DOMAIN}`;

const dependsOnlyOn = (
	sourceGlob: string,
	allowedGlob: string,
): Promise<Violation[]> =>
	projectFiles(TSCONFIG_PATH)
		.inPath(sourceGlob)
		.shouldNot()
		.dependOnFiles()
		.inPath("**", { except: { inPath: allowedGlob } })
		.check({ allowEmptyTests: true });

const neverDependsOn = (
	sourceGlob: string,
	forbiddenGlob: string,
): Promise<Violation[]> =>
	projectFiles(TSCONFIG_PATH)
		.inPath(sourceGlob)
		.shouldNot()
		.dependOnFiles()
		.inPath(forbiddenGlob)
		.check({ allowEmptyTests: true });

const othersNeverDependOn = (folderGlob: string): Promise<Violation[]> =>
	projectFiles(TSCONFIG_PATH)
		.inPath("src/**", { except: { inPath: folderGlob } })
		.shouldNot()
		.dependOnFiles()
		.inPath(folderGlob)
		.check({ allowEmptyTests: true });

export {
	DOMAIN,
	dependsOnlyOn,
	neverDependsOn,
	othersNeverDependOn,
	PERIMETERS,
	TSCONFIG_PATH,
};
