// 저장소: chrome.storage.local (unlimitedStorage). 서버 전송 없음.
// 같은 주문번호가 새로 들어오면 그 주문의 기존 행을 모두 교체한다(replace_orders와 동일 규칙).
export function mergeOrders(existing, incoming) {
  const nos = new Set(incoming.map((r) => r.order_no));
  return [...incoming, ...existing.filter((r) => !nos.has(r.order_no))]
    .sort((a, b) => (a.dt < b.dt ? 1 : a.dt > b.dt ? -1 : 0)); // 최신순, 같은 시각이면 입력 순서 유지(안정 정렬)
}
export async function loadOrders(area = chrome.storage.local) {
  return (await area.get("orders")).orders ?? [];
}
export async function saveOrders(rows, area = chrome.storage.local) {
  await area.set({ orders: rows, updatedAt: new Date().toISOString() });
}
export async function addOrders(incoming, area = chrome.storage.local) {
  const merged = mergeOrders(await loadOrders(area), incoming);
  await saveOrders(merged, area); return merged.length;
}
