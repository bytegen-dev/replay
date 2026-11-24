import assert from "node:assert/strict";
import { test } from "node:test";
import { fumbleCardFileName } from "../src/lib/fumble/card.ts";

test("the picture is named for the wallet's ends and the day of the scan", () => {
  assert.equal(fumbleCardFileName({ wallet: "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj", scannedAt: 1_795_300_000 }), "replay-recap-card-dfmx-xhzj-2026-11-21.png");
});

test("masking or hiding a number marks the name private, and hiding the wallet also leaves its ends out", () => {
  const r = { wallet: "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj", scannedAt: 1_795_300_000 };
  assert.equal(fumbleCardFileName(r, { pnl: "mask" }), "replay-recap-card-dfmx-xhzj-2026-11-21-private.png");
  assert.equal(fumbleCardFileName(r, { fumble: "hide" }), "replay-recap-card-dfmx-xhzj-2026-11-21-private.png");
  assert.equal(fumbleCardFileName(r, { roundtrip: "mask" }), "replay-recap-card-dfmx-xhzj-2026-11-21-private.png");
  assert.equal(fumbleCardFileName(r, { volume: "hide" }), "replay-recap-card-dfmx-xhzj-2026-11-21-private.png");
  assert.equal(fumbleCardFileName(r, { wallet: true }), "replay-recap-card-2026-11-21-private.png");
  assert.equal(fumbleCardFileName(r, { pnl: "show", fumble: "show", volume: "show", wallet: false }), "replay-recap-card-dfmx-xhzj-2026-11-21.png");
});
