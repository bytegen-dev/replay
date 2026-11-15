import assert from "node:assert/strict";
import { test } from "node:test";
import { joinXStocks, searchXStocks, stockName, stockSymbol } from "../src/lib/xstocks.ts";

const MINT_A = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const MINT_B = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const MINT_C = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";

const markets = [
  { id: "tesla-xstock", symbol: "tslax", name: "Tesla xStock" },
  { id: "nvidia-xstock", symbol: "nvdax", name: "NVIDIA xStock" },
  { id: "apple-xstock", symbol: "aaplx", name: "Apple xStock" },
  { id: "eth-only-xstock", symbol: "ethx", name: "Ethereum Only xStock" },
  { id: "bad-xstock", symbol: "badx", name: "Bad Mint xStock" },
  { id: "dupe-xstock", symbol: "dupx", name: "Dupe xStock" },
];
const platforms = {
  "tesla-xstock": MINT_A,
  "nvidia-xstock": MINT_B,
  "apple-xstock": MINT_C,
  "bad-xstock": "0x1234",
  "dupe-xstock": MINT_A,
};

test("name and ticker formatting", () => {
  assert.equal(stockName("Tesla xStock"), "Tesla");
  assert.equal(stockName("Foo xStocks"), "Foo");
  assert.equal(stockName("xStock"), "xStock");
  assert.equal(stockSymbol("tslax"), "TSLAx");
  assert.equal(stockSymbol("$nvdax"), "NVDAx");
});

test("join keeps only valid, unique Solana mints and sorts by name", () => {
  const list = joinXStocks(markets, platforms);
  assert.deepEqual(list.map((s) => s.name), ["Apple", "NVIDIA", "Tesla"]);
  assert.equal(list.find((s) => s.name === "Tesla")?.mint, MINT_A);
});

test("search ranks ticker and prefix matches first, and ignores the trailing x", () => {
  const list = joinXStocks(markets, platforms);
  assert.deepEqual(searchXStocks(list, "tsla").map((s) => s.name), ["Tesla"]);
  assert.deepEqual(searchXStocks(list, "TSLAx").map((s) => s.name), ["Tesla"]);
  assert.deepEqual(searchXStocks(list, "app").map((s) => s.name), ["Apple"]);
  assert.deepEqual(searchXStocks(list, "dia").map((s) => s.name), ["NVIDIA"]);
  assert.equal(searchXStocks(list, "zzz").length, 0);
  assert.equal(searchXStocks(list, "  ").length, list.length);
});
