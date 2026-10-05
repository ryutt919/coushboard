// 실제 Chromium에 확장을 로드해 대시보드가 동작하는지 확인한다. 실행: node test/e2e.mjs
import { createRequire } from "node:module";
const require = createRequire("/opt/npm-tools/node_modules/");
const { chromium } = require("playwright");
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import assert from "node:assert/strict";
import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "ext-")), {
  executablePath: "/opt/pw-browsers/chromium/chrome-linux/chrome".replace(/.*/, process.env.CHROME || "/opt/pw-browsers/chromium"),
  headless: false, args: ["--headless=new", "--no-sandbox", `--disable-extensions-except=${root}`, `--load-extension=${root}`] });
let sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const id = new URL(sw.url()).host; console.log("extension id:", id);
const page = await ctx.newPage(); const errors = [];
page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`chrome-extension://${id}/dashboard.html`);
await page.waitForSelector(".empty");
await page.setInputFiles("#file", path.join(root, "test/fixtures/orders_fixture.csv"));
await page.waitForSelector(".kpis");
const txt = await page.locator(".kpis").innerText();
assert.match(txt, /341,050원/); // 오라클 기대값(전체 기간, 구매 확정분)
assert.match(await page.locator("#main").innerText(), /펩시 제로 슈거 라임향/); // 전체 기간: 3회
await page.selectOption("#period", "2026"); await page.waitForTimeout(200);
assert.match(await page.locator(".kpis").innerText(), /56,090원/);
await page.screenshot({ path: path.join(root, "test/dashboard.png"), fullPage: true });
// 새로고침 후에도 데이터 유지(chrome.storage.local)
await page.reload(); await page.waitForSelector(".kpis");
// 팝업 렌더
const pop = await ctx.newPage(); await pop.goto(`chrome-extension://${id}/popup.html`); await pop.waitForSelector("#collect");
assert.deepEqual(errors, []);
console.log("OK: extension loads, CSV import, period filter, persistence, popup, no console errors");
await ctx.close();
