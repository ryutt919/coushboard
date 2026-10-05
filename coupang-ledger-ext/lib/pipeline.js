// oracle.py의 JS 포팅. 입력 행: {order_no, dt, product_no, status, raw_name, qty, price}
export const OK = new Set(["배송완료", "교환완료", "배송중"]);
export const RET = new Set(["반품완료", "취소완료"]);
const PREFIX = /^(\[[^\]]*\]|\([^)]*\))\s*/;
const PIECES = /\d+(?=\s*(?:개|롤|구|정|캔))/g;

export function dedupe(rows) {
  const seen = new Set(), kept = [], removed = [];
  rows.forEach((r, idx) => {
    r = { ...r, idx, date: r.dt.slice(0, 10) };
    const k = [r.order_no, r.product_no, r.price, r.qty].join("|");
    (seen.has(k) ? removed : kept).push(r); seen.add(k);
  });
  return { kept, removed };
}

export function enrich(rows, rules, merges) {
  const cats = rules.categories.map((c) => [c.name, new RegExp(c.keywords.join("|"))]);
  return rows.map((r) => {
    const name = r.raw_name.replace(PREFIX, "");
    const cut = name.indexOf(",");
    const base = (cut < 0 ? name : name.slice(0, cut)).trim();
    const opt = cut < 0 ? "" : name.slice(cut + 1).trim();
    const nums = [...opt.matchAll(PIECES)].map((m) => +m[0]);
    const pieces = nums.length ? Math.max(...nums) : 1;
    const hit = cats.find(([, rx]) => rx.test(name));
    return { ...r, name, base, group: merges[base] ?? base, pieces,
      unit_price: r.price / pieces, amount: r.price * r.qty,
      category: hit ? hit[0] : rules.fallback };
  });
}

function months(a, b) {
  let y = +a.slice(0, 4), m = +a.slice(5, 7); const ey = +b.slice(0, 4), em = +b.slice(5, 7), out = [];
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); if (++m > 12) { y++; m = 1; } }
  return out;
}

export function summarize(rows, from, to, status, dataEnd) {
  const pass = (r) => (status === "ok" ? OK.has(r.status) : status === "ret" ? RET.has(r.status) : true);
  const sel = rows.filter((r) => r.date >= from && r.date <= to && pass(r));
  const ms = months(from, to), yearly = ms.length > 18;
  const keys = yearly ? [...new Set(ms.map((m) => m.slice(0, 4)))] : ms;
  const kf = (d) => (yearly ? d.slice(0, 4) : d.slice(0, 7));
  const endK = yearly ? dataEnd.slice(0, 4) : dataEnd.slice(0, 7);
  const buckets = Object.fromEntries(keys.map((k) => [k, { n: 0, amount: 0, future: k > endK }]));
  const byCat = {}, groups = {};
  for (const r of sel) {
    const b = buckets[kf(r.date)]; if (b) { b.n++; b.amount += r.amount; }
    const c = (byCat[r.category] ??= { n: 0, amount: 0 }); c.n++; c.amount += r.amount;
    (groups[r.group] ??= []).push(r);
  }
  const products = Object.entries(groups).filter(([, l]) => l.length >= 2).map(([group, l]) => {
    const days = [...new Set(l.map((x) => x.date))].sort();
    const u = l.map((x) => x.unit_price);
    return { group, n: l.length, amount: l.reduce((s, x) => s + x.amount, 0), order_days: days.length,
      last: days.at(-1), min_unit_price: Math.round(Math.min(...u) * 100) / 100,
      max_unit_price: Math.round(Math.max(...u) * 100) / 100,
      aliases: [...new Set(l.map((x) => x.base))].sort() };
  }).sort((a, b) => b.n - a.n || b.amount - a.amount || (a.group < b.group ? -1 : 1));
  return { from, to, status, rows: sel.length, total: sel.reduce((s, r) => s + r.amount, 0),
    order_days: new Set(sel.map((r) => r.date)).size, granularity: yearly ? "year" : "month",
    buckets, by_category: byCat, products };
}

// 중복 제거는 CSV 내보내기 산출물(src:"csv")에만 적용한다. 화면에서 직접 수집한 행(src:"collect")은
// 같은 상품을 같은 주문에서 두 줄로 산 경우일 수 있으므로 그대로 둔다.
export function runPipeline(rawRows, rules, merges) {
  const csv = rawRows.filter((r) => r.src !== "collect");
  const live = rawRows.filter((r) => r.src === "collect").map((r) => ({ ...r, date: r.dt.slice(0, 10) }));
  const { kept, removed } = dedupe(csv);
  const rows = enrich([...kept, ...live], rules, merges);
  const dates = rows.map((r) => r.date).sort();
  return { rows, removed: removed.length, dataStart: dates[0], dataEnd: dates.at(-1),
    unclassified: rows.filter((r) => r.category === rules.fallback).length };
}
