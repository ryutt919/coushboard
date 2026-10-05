// 쿠팡 주문목록 어댑터. DOM 클릭 대신 mc.coupang.com 의 내부 주문 API(읽기 전용 GET)를 같은 오리진으로 호출한다.
//   GET /ssr/api/myorders/model?requestYear=YYYY&pageIndex=N&size=5   (pageIndex 는 0부터)
// 확인된 사실(2025년 전체 순회, 2026-10-05):
//  - 연도가 끝나도 응답의 hasNext 는 false 가 되지 않고 nextYear 가 바뀌며 nextPageIndex 가 0 으로 돌아간다.
//    그래서 연도 안의 hasNext 는 `api.hasNext && api.nextYear === 현재 연도` 로 정의한다.
//  - 행은 deliveryGroupList[].productList[] 에서만 만든다. deliveryCancelBundleList 는 그 복제본이라 읽으면 이중 집계된다.
//  - 열 대응: 상품번호=vendorItemId, 상품명=vendorItemName, 판매가=discountedUnitPrice(정가는 unitPrice).
//  - 상태 대응은 CSV 2025년 352줄과 줄 수, 상태별 개수(248/89/13/2), 주문 수(181)까지 일치함을 확인했다(mapStatus 참고).
// 실패하면 즉시 던진다(재시도 없음). 로그인 풀림/캡차/4xx/5xx/예상 밖 응답 모양 모두 해당한다.
const BASE = "/ssr/api/myorders/model";
const PAGE_SIZE = 5;
const KST_MS = 9 * 3600 * 1000;

export const UNKNOWN = "미확인";

// 상태 대응. 상품 줄의 cancelReturnStatus 가 있으면 그것이, 없으면 배송그룹 invoiceStatus 가 정한다.
//  - 확인됨(CSV 대조): RETURN_COMPLETE→반품완료(배송그룹이 DELIVERING 이어도 동일), CANCELED→취소완료,
//    FINAL_DELIVERY→배송완료, DELIVERING→배송중. 교환 사례 1건도 CSV 에서는 1줄 반품완료였다.
//  - 미확인: EXCHANGE_COMPLETE 가 줄에 찍히는 경우(2025년에는 없었음), 취소 없이 ACCEPT/INSTRUCT 인 줄(결제 직후 주문).
//    추측하지 않고 `미확인(값)` 으로 남겨 눈에 띄게 한다. 대시보드의 "구매 확정/반품" 필터에는 잡히지 않는다.
export function mapStatus(group, item) {
  switch (item.cancelReturnStatus) {
    case "RETURN_COMPLETE": return "반품완료";
    case "CANCELED": return "취소완료";
    case "EXCHANGE_COMPLETE": return "교환완료";
    case undefined: case null: case "": break;
    default: return `${UNKNOWN}(${item.cancelReturnStatus})`;
  }
  switch (group.invoiceStatus) {
    case "FINAL_DELIVERY": return "배송완료";
    case "DELIVERING": return "배송중";
    default: return `${UNKNOWN}(${group.invoiceStatus})`;
  }
}

const shapeError = (what) => new Error(`UNEXPECTED_SHAPE: 쿠팡 응답 형식이 달라졌습니다(${what}). adapter 확인 필요`);

export function kstDateTime(epochMs) {
  return new Date(epochMs + KST_MS).toISOString().replace("T", " ").slice(0, 19);
}

// 주문 1건 -> 행 배열. 필수 필드가 없으면 조용히 넘기지 않고 던진다.
export function rowsFromOrder(o) {
  if (!Number.isFinite(o.orderedAt) || o.orderId == null || !Array.isArray(o.deliveryGroupList)) throw shapeError("order");
  const dt = kstDateTime(o.orderedAt);
  return o.deliveryGroupList.flatMap((g) => {
    if (!Array.isArray(g.productList)) throw shapeError("deliveryGroup.productList");
    return g.productList.map((it) => {
      if (it.vendorItemId == null || typeof it.vendorItemName !== "string"
        || !Number.isFinite(it.quantity) || !Number.isFinite(it.discountedUnitPrice)) throw shapeError("productList item");
      return {
        order_no: String(o.orderId), dt, product_no: String(it.vendorItemId), status: mapStatus(g, it),
        raw_name: it.vendorItemName, qty: it.quantity, price: it.discountedUnitPrice, src: "collect",
      };
    });
  });
}

// 연도 칩(<div>, 텍스트가 정확히 4자리 연도)을 읽는다. 클래스명은 해시라 쓰지 않는다.
function yearsFromChips(doc) {
  const ys = [...doc.querySelectorAll("div, a, button, li, span")]
    .filter((el) => !el.children.length && /^20\d\d$/.test((el.textContent || "").trim()))
    .map((el) => el.textContent.trim());
  return [...new Set(ys)].sort().reverse();
}

// 테스트에서 fetch/doc/loc 를 바꿔 끼울 수 있게 팩토리로 만든다. import 시점에는 아무 것도 호출하지 않는다.
export function createAdapter({ fetchFn = (...a) => globalThis.fetch(...a), doc = globalThis.document, loc = globalThis.location, warn = console.warn } = {}) {
  let year = null, api = null, pageIndex = 0;
  const warned = new Set();

  async function fetchPage(y, idx) {
    const r = await fetchFn(`${BASE}?requestYear=${y}&pageIndex=${idx}&size=${PAGE_SIZE}`,
      { credentials: "same-origin", headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP_${r.status}: 쿠팡이 요청을 거절했습니다. 잠시 후 다시 시도해 주세요`);
    if (r.redirected || !(r.headers.get("content-type") || "").includes("json"))
      throw new Error("LOGIN_OR_CAPTCHA: 로그인이 풀렸거나 캡차가 떴습니다. 쿠팡 탭에서 확인 후 다시 시작해 주세요");
    const data = JSON.parse(await r.text()); // 주문번호/상품번호는 안전 정수 범위이고, 줄 ID 는 문자열로 바꿔 보관한다
    if (!Array.isArray(data.orderList)) throw shapeError("orderList");
    year = String(y); pageIndex = idx; api = data;
  }

  return {
    async listYears() {
      if (loc && loc.host !== "mc.coupang.com") throw new Error("쿠팡 주문목록 페이지(mc.coupang.com)에서 실행해 주세요");
      const ys = yearsFromChips(doc);
      if (!ys.length) throw new Error("연도 칩을 찾지 못했습니다. 주문목록 페이지인지 확인해 주세요(adapter 확인 필요)");
      return ys;
    },
    async goYear(y) { await fetchPage(y, 0); },
    async readPage() {
      const rows = api.orderList.flatMap(rowsFromOrder);
      for (const r of rows) if (r.status.startsWith(UNKNOWN) && !warned.has(r.status)) { warned.add(r.status); warn(`[쿠팡 가계부] 상태 대응이 없는 값: ${r.status}`); }
      return rows;
    },
    async hasNext() {
      if (!api.hasNext || String(api.nextYear) !== year) return false;
      if (api.nextPageIndex !== pageIndex + 1) throw new Error(`PAGING_BROKEN: pageIndex ${pageIndex} 다음이 ${api.nextPageIndex} 입니다. 중단합니다`);
      return true;
    },
    async nextPage() { await fetchPage(year, pageIndex + 1); },
  };
}

export const adapter = createAdapter();
