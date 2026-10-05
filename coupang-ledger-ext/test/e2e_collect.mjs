// 실제 Chromium에 확장을 로드해 "팝업 수집 -> 콘텐츠 스크립트 -> 어댑터 -> chrome.storage.local -> 대시보드" 전체 경로를 확인한다.
// 쿠팡 서버에는 접속하지 않는다. https://mc.coupang.com 요청을 가로채 합성 응답(실제 응답과 같은 필드 이름)을 돌려준다.
// 실행: node test/e2e_collect.mjs   (저장소 루트의 node_modules/@playwright/test 와 Playwright Chromium 필요)
import { chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import assert from "node:assert/strict";
import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- 합성 쿠팡 데이터: 2026(주문 7, 2페이지), 2025(주문 6, 2페이지), 2024(주문 3, 1페이지) ----
const it = (id, name, o = {}) => ({ vendorItemId: id, vendorItemName: name, quantity: 1, unitPrice: 1000, discountedUnitPrice: 900, ...o });
const ord = (id, dt, groups) => ({ orderId: id, orderedAt: Date.parse(dt + "+09:00"), deliveryGroupList: groups });
const grp = (inv, items) => ({ invoiceStatus: inv, productList: items });
const D = {
  2026: [ord(26000000000007, "2026-09-30T10:00:00", [grp("FINAL_DELIVERY", [it(701, "탐사수 무라벨, 2L, 12개", { quantity: 2, unitPrice: 7000, discountedUnitPrice: 6790 })])]),
    ord(26000000000006, "2026-09-20T10:00:00", [grp("FINAL_DELIVERY", [it(601, "콜라 제로, 500ml, 20개")]), grp("FINAL_DELIVERY", [it(601, "콜라 제로, 500ml, 20개")])]),
    ord(26000000000005, "2026-08-20T10:00:00", [grp("INSTRUCT", [it(501, "취소될 상품", { cancelReturnStatus: "CANCELED" })])]),
    ord(26000000000004, "2026-07-20T10:00:00", [grp("FINAL_DELIVERY", [it(401, "반품 상품", { cancelReturnStatus: "RETURN_COMPLETE" })])]),
    ord(26000000000003, "2026-06-20T10:00:00", [grp("DELIVERING", [it(301, "배송중 상품")])]),
    ord(26000000000002, "2026-05-20T10:00:00", [grp("FINAL_DELIVERY", [it(201, "일반 상품 A")])]),
    ord(26000000000001, "2026-01-02T00:30:00", [grp("FINAL_DELIVERY", [it(101, "일반 상품 B"), it(102, "일반 상품 C")])])],
  2025: [6, 5, 4, 3, 2, 1].map((n) => ord(25000000000000 + n, `2025-0${n}-15T12:00:00`, [grp("FINAL_DELIVERY", [it(2500 + n, `2025년 상품 ${n}`)])])),
  2024: [3, 2, 1].map((n) => ord(24000000000000 + n, `2024-0${n}-10T12:00:00`, [grp("FINAL_DELIVERY", [it(2400 + n, `2024년 상품 ${n}`)])])),
};
const expected = Object.fromEntries(Object.entries(D).map(([y, os]) => [y, os.flatMap((o) => o.deliveryGroupList.flatMap((g) => g.productList)).length]));
const totalExpected = Object.values(expected).reduce((a, b) => a + b, 0);
const yearsDesc = Object.keys(D).sort().reverse().map(Number);

const apiCalls = []; let failMode = null, hits = 0; // hits: 응답 종류와 무관한 API 요청 수
function api(url) {
  const q = new URL(url).searchParams, y = +q.get("requestYear"), p = +q.get("pageIndex"), size = +q.get("size");
  apiCalls.push({ y, p, t: Date.now() });
  const list = D[y] ?? [], last = (p + 1) * size >= list.length, ny = last ? y - 1 : y;
  return { pageIndex: p, size, orderList: list.slice(p * size, (p + 1) * size), orderItemTotalCount: 0,
    hasNext: !last || !!D[y - 1], nextYear: ny, nextPageIndex: last ? 0 : p + 1, hasPrev: p > 0, prevYear: y, prevPageIndex: Math.max(0, p - 1), partial: false };
}
const LIST_HTML = `<!doctype html><meta charset=utf-8><title>주문목록</title><body><div>최근 6개월</div>${yearsDesc.map((y) => `<div class="sc-x">${y}</div>`).join("")}</body>`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "ext-e2e-")), {
  headless: false, args: ["--headless=new", `--disable-extensions-except=${root}`, `--load-extension=${root}`] });
await ctx.route("https://mc.coupang.com/**", (route) => {
  const u = route.request().url();
  if (u.includes("/ssr/api/myorders/model")) {
    hits++;
    if (failMode === 429) return route.fulfill({ status: 429, body: "slow down" });
    if (failMode === "login") return route.fulfill({ status: 200, contentType: "text/html", body: "<html>login</html>" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(api(u)) });
  }
  return route.fulfill({ status: 200, contentType: "text/html", body: LIST_HTML });
});
const errors = [];
const sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const id = new URL(sw.url()).host; console.log("extension id:", id);
const watch = (p) => { p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && errors.push(m.text())); };

const order = await ctx.newPage(); watch(order);
await order.goto("https://mc.coupang.com/ssr/desktop/order/list");
const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "*://mc.coupang.com/*" }))[0].id);

async function runCollect() {
  const pop = await ctx.newPage(); watch(pop);
  await pop.goto(`chrome-extension://${id}/popup.html`);
  // 팝업은 별도 탭에서 열려 "현재 활성 탭"이 쿠팡 탭이 아니므로, 활성 탭 조회만 쿠팡 탭으로 돌려 준다(그 외 동작은 실제와 같다).
  await pop.evaluate(([tid]) => { chrome.tabs.query = async () => [{ id: tid, url: "https://mc.coupang.com/ssr/desktop/order/list" }]; }, [tabId]);
  await pop.click("#collect");
  await pop.waitForFunction(() => /^(완료|중단됨|오류)/.test(document.getElementById("status").textContent), null, { timeout: 90000 });
  const text = await pop.locator("#status").innerText(); await pop.close(); return text;
}

// 1) 정상 수집
const t0 = Date.now();
const done = await runCollect();
console.log("popup:", done);
assert.match(done, /^완료/);
for (const y of yearsDesc) assert.match(done, new RegExp(`${y}:${expected[y]}`));
const calls = apiCalls.map((c) => `${c.y}/${c.p}`);
assert.deepEqual(calls, ["2026/0", "2026/1", "2025/0", "2025/1", "2024/0"]); // 연도 칩 순서, 연도 안 페이지, 연도 경계에서 넘어가지 않음
const gaps = apiCalls.slice(1).map((c, i) => c.t - apiCalls[i].t);
assert.ok(gaps.every((g) => g >= 2000), `요청 간격 2초 이상이어야 함: ${gaps}`); console.log("요청 간격(ms):", gaps.join(", "));

const stored = await sw.evaluate(async () => (await chrome.storage.local.get("orders")).orders);
assert.equal(stored.length, totalExpected);
assert.ok(stored.every((r) => r.src === "collect" && typeof r.order_no === "string" && typeof r.product_no === "string"));
const by = (no) => stored.filter((r) => r.order_no === String(no));
assert.equal(by(26000000000007)[0].price, 6790); assert.equal(by(26000000000007)[0].qty, 2);   // 판매가, 수량
assert.equal(by(26000000000006).length, 2);                                                       // 같은 상품 두 줄 유지
assert.equal(by(26000000000005)[0].status, "취소완료"); assert.equal(by(26000000000004)[0].status, "반품완료");
assert.equal(by(26000000000003)[0].status, "배송중"); assert.equal(by(26000000000002)[0].status, "배송완료");
assert.equal(by(26000000000001)[0].dt, "2026-01-02 00:30:00");                                    // KST
assert.deepEqual(stored.map((r) => r.dt), stored.map((r) => r.dt).sort().reverse());              // 최신순 저장

// 2) 대시보드 반영
const dash = await ctx.newPage(); watch(dash);
await dash.goto(`chrome-extension://${id}/dashboard.html`);
await dash.waitForSelector(".kpis");
console.log("dashboard KPI:", (await dash.locator(".kpis").innerText()).replace(/\s+/g, " "));
await dash.selectOption("#period", "2025"); await dash.waitForTimeout(200);
assert.match(await dash.locator(".kpis").innerText(), /5,400원/); // 2025년 상품 6줄 x 900원
await dash.screenshot({ path: path.join(root, "test", "dashboard_collected.png"), fullPage: true });

// 3) 다시 수집하면 같은 주문은 교체되어 중복되지 않는다
await runCollect();
assert.equal((await sw.evaluate(async () => (await chrome.storage.local.get("orders")).orders)).length, totalExpected);

// 4) 오류: 429 / 로그인 풀림은 1회만 호출하고 즉시 중단, 저장 내용은 그대로
for (const mode of [429, "login"]) {
  failMode = mode; hits = 0;
  const msg = await runCollect();
  console.log(`popup(${mode}):`, msg);
  assert.match(msg, /^오류/); assert.equal(hits, 1, `${mode}: 재시도 없이 1회`);
}
failMode = null;
assert.equal((await sw.evaluate(async () => (await chrome.storage.local.get("orders")).orders)).length, totalExpected);

assert.deepEqual(errors.filter((e) => !/status of 429|Failed to load resource/.test(e)), []);
console.log(`OK: 확장 로드, 팝업 수집(${totalExpected}줄), 연도 순회, 저장, 대시보드, 재수집 교체, 오류 즉시 중단 (${Math.round((Date.now() - t0) / 1000)}초)`);
await ctx.close();
