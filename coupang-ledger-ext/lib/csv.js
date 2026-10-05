// 최소 CSV 파서: BOM, 따옴표, 줄바꿈 처리. ID 열의 탭 문자는 trim.
export function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const REQUIRED = ["주문번호", "주문일시", "상품번호", "상태", "상품명", "수량", "판매가"];
export function ordersFromCsv(text) {
  const raw = parseCsv(text);
  if (raw.length) {
    const miss = REQUIRED.filter((c) => !(c in raw[0]));
    if (miss.length) throw new Error("필수 열 없음: " + miss.join(", "));
  }
  return raw.map((r) => ({
    order_no: r["주문번호"].trim(), dt: r["주문일시"].trim(),
    product_no: r["상품번호"].trim(), status: r["상태"].trim(),
    raw_name: r["상품명"], src: "csv", qty: parseInt(r["수량"], 10), price: parseInt(r["판매가"], 10),
  }));
}
