import assert from "node:assert/strict";
import { test as it } from "node:test";
import { Surface } from "../generated/domain/surface.g.ts";
import { Cursor } from "./cursor.ts";

it("a cursor turns to the next page of the surface", () => {
	assert.equal(Cursor.create().next() instanceof Surface, true);
});

it("a cursor turns to the previous page of the surface", () => {
	assert.equal(Cursor.create().previous() instanceof Surface, true);
});

it("a cursor carries no data yet", () => {
	assert.deepEqual(Cursor.dataOf(Cursor.create()), {});
});
