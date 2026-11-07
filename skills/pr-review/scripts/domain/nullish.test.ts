import assert from "node:assert/strict";
import { test as it } from "node:test";
import {
	emptyAsNull,
	isNullOrEmpty,
	nonEmptyString,
	nonnull,
} from "./nullish.ts";

const REQUIRED_RE = /Required/u;

it("nonnull returns defined non-null values and throws on null or undefined", () => {
	assert.equal(nonnull("ok"), "ok");
	assert.equal(nonnull(0), 0);
	assert.throws(() => nonnull(null), REQUIRED_RE);
	assert.throws(() => nonnull(undefined), REQUIRED_RE);
});

it("isNullOrEmpty detects null, undefined, and empty string", () => {
	assert.equal(isNullOrEmpty(null), true);
	assert.equal(isNullOrEmpty(undefined), true);
	assert.equal(isNullOrEmpty(""), true);
	assert.equal(isNullOrEmpty("a"), false);
	assert.equal(isNullOrEmpty(0), false);
});

it("emptyAsNull folds empty string and undefined to null", () => {
	assert.equal(emptyAsNull(""), null);
	assert.equal(emptyAsNull(undefined), null);
	assert.equal(emptyAsNull(null), null);
	assert.equal(emptyAsNull("abc"), "abc");
});

it("nonEmptyString returns non-empty string and throws on empty, null, or undefined", () => {
	assert.equal(nonEmptyString("abc"), "abc");
	assert.throws(() => nonEmptyString(""), REQUIRED_RE);
	assert.throws(() => nonEmptyString(null), REQUIRED_RE);
	assert.throws(() => nonEmptyString(undefined), REQUIRED_RE);
});
