import assert from "node:assert/strict";
import { test } from "node:test";
import { trackOffset } from "../src/lib/cursorTrack.ts";

const C = { x: 100, y: 100 };
const lean = (px: number, py: number) => trackOffset(C, { x: px, y: py }, 260, 3);
const size = (o: { x: number; y: number }) => Math.hypot(o.x, o.y);

test("the lens sits still on top of the icon and when the pointer is far away", () => {
  assert.deepEqual(lean(100, 100), { x: 0, y: 0 });
  assert.deepEqual(lean(100 + 260, 100), { x: 0, y: 0 });
  assert.deepEqual(lean(100 + 900, 100 - 400), { x: 0, y: 0 });
});

test("it leans the way the pointer is, and never further than its biggest lean", () => {
  const right = lean(160, 100);
  assert.ok(right.x > 0 && Math.abs(right.y) < 1e-9);
  const up = lean(100, 40);
  assert.ok(up.y < 0 && Math.abs(up.x) < 1e-9);
  const diagonal = lean(150, 150);
  assert.ok(diagonal.x > 0 && diagonal.y > 0 && Math.abs(diagonal.x - diagonal.y) < 1e-9);
  for (const d of [1, 5, 28, 60, 100, 200, 259]) assert.ok(size(lean(100 + d, 100)) <= 3 + 1e-9, `at ${d}`);
});

test("it grows from the middle, holds while the pointer is close, and fades out toward the reach", () => {
  // Just off the middle it leans a little, not all the way: no jump to one side.
  assert.ok(size(lean(105, 100)) < size(lean(128, 100)));
  // It reaches its full lean exactly where the grow-in distance (28 pixels) ends.
  assert.ok(Math.abs(size(lean(128, 100)) - 3) < 1e-9);
  // Close, it is at its full lean; further out it is weaker and weaker.
  assert.ok(Math.abs(size(lean(160, 100)) - 3) < 1e-9);
  assert.ok(size(lean(160, 100)) > size(lean(300, 100)));
  assert.ok(size(lean(300, 100)) > size(lean(350, 100)));
  assert.ok(size(lean(350, 100)) > 0);
});
