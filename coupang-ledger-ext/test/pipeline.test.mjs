import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { ordersFromCsv } from "../lib/csv.js";
import { runPipeline, summarize } from "../lib/pipeline.js";
const rd = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const exp = JSON.parse(rd("./fixtures/expected_without_receipts.json"));
const rules = JSON.parse(rd("../data/category-rules.json")), merges = JSON.parse(rd("../data/product-merges.json"));
const res = runPipeline(ordersFromCsv(rd("./fixtures/orders_fixture.csv")), rules, merges);
assert.equal(res.removed, exp.dedupe.removed);
assert.equal(res.rows.length, exp.rows_after_dedupe);
assert.equal(res.unclassified, exp.unclassified);
let n = 0;
for (const e of exp.summaries) {
  const s = summarize(res.rows, e.from, e.to, e.status, res.dataEnd);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), e, `summary ${e.from}~${e.to} ${e.status}`); n++;
}
console.log(`OK: dedupe/enrich + ${n} summaries match oracle fixtures`);
