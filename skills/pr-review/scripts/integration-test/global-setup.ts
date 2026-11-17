import {
	cleanupReviewToolForTest,
	installReviewToolForTest,
} from "./scenario.ts";

export function globalSetup(): void {
	Object.assign(process.env, {
		PR_REVIEW_TEST_BIN_DIR: installReviewToolForTest(),
	});
}

export function globalTeardown(): void {
	cleanupReviewToolForTest();
}
