import { env } from "node:process";
import {
	cleanupReviewToolForTest,
	installReviewToolForTest,
} from "./scenario-cli.ts";

const TEST_BIN_DIR_KEY = "PR_REVIEW_TEST_BIN_DIR";

function globalSetup(): void {
	Object.assign(env, {
		[TEST_BIN_DIR_KEY]: installReviewToolForTest(),
	});
}

function globalTeardown(): void {
	cleanupReviewToolForTest();
}

export { globalSetup, globalTeardown };
