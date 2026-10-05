import assert from "node:assert/strict";
import { collectAll } from "../lib/collect.js";
import { mergeOrders } from "../lib/store.js";
// 모의 어댑터: 2024(2페이지), 2025(3페이지), 2026(1페이지)
const data = { 2026: [[1]], 2025: [[2, 3], [4], [5]], 2024: [[6], [7]] };
const mk = () => { let y, p; return {
  listYears: async () => Object.keys(data).sort().reverse(),
  goYear: async (v) => { y = v; p = 0; },
  readPage: async () => data[y][p].map((n) => ({ order_no: String(n), product_no: "1", price: 1, qty: 1 })),
  hasNext: async () => p < data[y].length - 1, nextPage: async () => { p++; } }; };
const fast = { sleepFn: async () => {}, delayMs: 0 };
let r = await collectAll(mk(), fast);
assert.equal(r.rows.length, 7); assert.deepEqual(r.perYear, { 2026: 1, 2025: 4, 2024: 2 });
// 페이지가 안 넘어가는 경우(nextPage 무효) → 무한 루프 없이 종료
const stuck = mk(); stuck.nextPage = async () => {}; stuck.hasNext = async () => true;
r = await collectAll(stuck, { ...fast, maxPages: 50 });
assert.equal(r.rows.length, 4); // 2026:1 + 2025:2(첫 페이지) + 2024:1, 반복 페이지는 버림
// 중단
const ac = new AbortController(); ac.abort();
r = await collectAll(mk(), { ...fast, signal: ac.signal }); assert.equal(r.aborted, true); assert.equal(r.rows.length, 0);
// 빈 연도 목록은 오류
await assert.rejects(collectAll({ listYears: async () => [] }, fast));
// 병합: 같은 주문번호는 교체, 나머지는 보존
const m = mergeOrders([{ order_no: "1", dt: "2026-01-01 00:00:00", status: "배송완료" }, { order_no: "2", dt: "2025-01-01 00:00:00" }],
  [{ order_no: "1", dt: "2026-01-01 00:00:00", status: "반품완료" }]);
assert.equal(m.length, 2); assert.equal(m.find((x) => x.order_no === "1").status, "반품완료");
console.log("OK: collect engine + merge");
