import { loadOrders, addOrders } from "./lib/store.js";
import { ordersFromCsv } from "./lib/csv.js";
import { runPipeline, summarize } from "./lib/pipeline.js";
const $ = (id) => document.getElementById(id);
const won = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; }; // textContent 기반: HTML 주입 방지
let rules, merges, orders = [], data = null;

async function boot() {
  [rules, merges] = await Promise.all(["data/category-rules.json", "data/product-merges.json"].map((p) => fetch(p).then((r) => r.json())));
  await reload();
}
async function reload() {
  orders = await loadOrders();
  data = orders.length ? runPipeline(orders, rules, merges) : null;
  const sel = $("period"); sel.replaceChildren(el("option", { value: "ALL", textContent: "전체 기간" }));
  if (data) {
    const ys = [...new Set(data.rows.map((r) => r.date.slice(0, 4)))].sort().reverse();
    ys.forEach((y) => sel.append(el("option", { value: y, textContent: y + "년" })));
    sel.append(el("option", { value: "custom", textContent: "직접 선택" }));
    $("from").value ||= data.dataStart; $("to").value ||= data.dataEnd;
  }
  render();
}
function range() {
  const v = $("period").value;
  if (v === "ALL") return [data.dataStart, data.dataEnd];
  if (v === "custom") return [$("from").value, $("to").value];
  return [`${v}-01-01`, `${v}-12-31`];
}
function bars(entries, fmt) {
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return entries.map(([k, v, sub]) => el("div", { className: "bar" }, el("span", { textContent: k }),
    el("i", { style: `width:${(v / max) * 100}%` }), el("span", { className: "n", textContent: sub ?? fmt(v) })));
}
function render() {
  const main = $("main"); main.replaceChildren();
  if (!data) { main.append(el("div", { className: "card empty", textContent: "데이터가 없습니다. 쿠팡 주문목록 탭에서 확장 아이콘으로 수집하거나, CSV를 가져오세요." })); $("msg").textContent = ""; return; }
  const [from, to] = range();
  if (!from || !to || from > to) { $("msg").textContent = "기간이 올바르지 않습니다."; return; }
  const s = summarize(data.rows, from, to, $("status").value, data.dataEnd);
  $("msg").textContent = `${data.dataStart} ~ ${data.dataEnd} · 원본 ${orders.length}행 → 분석 ${data.rows.length}행 (중복 제거 ${data.removed}, 미분류 ${data.unclassified})`;
  const k = (t, v) => el("div", { className: "kpi" }, el("span", { className: "muted", textContent: t }), el("b", { textContent: v }));
  main.append(el("div", { className: "card kpis" }, k("총 지출", won(s.total)), k("구매 행 수", s.rows + "건"), k("주문일 수", s.order_days + "일"), k("월/연 평균", won(s.total / Math.max(1, Object.values(s.buckets).filter((b) => !b.future).length)))));
  const cats = Object.entries(s.by_category).sort((a, b) => b[1].amount - a[1].amount).map(([c, v]) => [c, v.amount, `${won(v.amount)}`]);
  const bk = Object.entries(s.buckets).map(([k, b]) => [k, b.future ? 0 : b.amount, b.future ? "—" : won(b.amount)]);
  main.append(el("div", { className: "cols" },
    el("div", { className: "card" }, el("h3", { textContent: "카테고리별" }), ...bars(cats, won)),
    el("div", { className: "card" }, el("h3", { textContent: s.granularity === "year" ? "연도별" : "월별" }), ...bars(bk, won))));
  const t = el("table", {}, el("tr", {}, ...["품목", "횟수", "합계", "개당 단가", "마지막"].map((h, i) => el("th", { className: i && i < 4 ? "n" : "", textContent: h }))));
  s.products.slice(0, 30).forEach((p) => t.append(el("tr", { title: p.aliases.join("\n") }, el("td", { textContent: p.group }), el("td", { className: "n", textContent: p.n }),
    el("td", { className: "n", textContent: won(p.amount) }), el("td", { className: "n", textContent: p.min_unit_price === p.max_unit_price ? won(p.min_unit_price) : `${won(p.min_unit_price)}~${won(p.max_unit_price)}` }), el("td", { textContent: p.last }))));
  main.append(el("div", { className: "card" }, el("h3", { textContent: "자주 산 품목 (2회 이상)" }), s.products.length ? t : el("div", { className: "empty", textContent: "해당 없음" })));
}
["period", "from", "to", "status"].forEach((id) => $(id).addEventListener("change", () => { if (id === "from" || id === "to") $("period").value = "custom"; if (data) render(); }));
$("imp").onclick = () => $("file").click();
$("file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const rows = ordersFromCsv(await f.text()); await addOrders(rows); $("msg").textContent = `${rows.length}행을 가져왔습니다.`; await reload(); }
  catch (err) { $("msg").textContent = "가져오기 실패: " + err.message; }
  e.target.value = "";
};
const dl = (name, text, type) => { const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name }); a.click(); URL.revokeObjectURL(a.href); };
$("exp").onclick = () => dl("coupang-orders.json", JSON.stringify(orders), "application/json");
$("expcsv").onclick = () => {
  const q = (v) => `"${String(v).replaceAll('"', '""')}"`, h = ["주문번호", "주문일시", "상품번호", "상태", "상품명", "수량", "판매가"];
  dl("coupang-orders.csv", "﻿" + [h.join(","), ...orders.map((r) => [r.order_no, r.dt, r.product_no, r.status, r.raw_name, r.qty, r.price].map(q).join(","))].join("\n"), "text/csv");
};
chrome.storage.onChanged.addListener((c) => { if (c.orders) reload(); });
boot();
