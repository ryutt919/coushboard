// 연도 × 페이지 순회 엔진. 쿠팡 화면 의존 부분은 adapter 로 분리했다(lib/adapter.js).
// adapter 인터페이스:
//   listYears(): Promise<string[]>         선택 가능한 연도 목록
//   goYear(year): Promise<void>            해당 연도로 전환하고 첫 페이지가 뜰 때까지 대기
//   readPage(): Promise<Row[]>             현재 페이지의 주문 행들
//   hasNext(): Promise<boolean>
//   nextPage(): Promise<void>              다음 페이지가 뜰 때까지 대기
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sig = (rows) => rows.map((r) => `${r.order_no}|${r.product_no}|${r.price}|${r.qty}`).join(",");

// 요청 간격은 2.2~3.5초(쿠팡 요청 간격 2초 이상 규칙).
export async function collectAll(adapter, { delayMs = 2200, jitter = 0.6, maxPages = 200, onProgress = () => {}, signal, sleepFn = sleep } = {}) {
  const wait = () => sleepFn(delayMs * (1 + Math.random() * jitter));
  const years = await adapter.listYears();
  if (!years.length) throw new Error("연도 목록을 찾지 못했습니다(adapter 확인 필요)");
  const all = [], perYear = {};
  for (const [yi, year] of years.entries()) {
    if (signal?.aborted) break;
    await adapter.goYear(year); await wait();
    let page = 1, prev = null, count = 0;
    for (;;) {
      if (signal?.aborted) break;
      const rows = await adapter.readPage();
      const s = sig(rows);
      if (s === prev) break;                       // 다음 페이지가 안 바뀌면 중단(무한 루프 방지)
      prev = s; all.push(...rows); count += rows.length;
      onProgress({ year, yearIndex: yi + 1, years: years.length, page, rows: count, total: all.length });
      if (page >= maxPages || !(await adapter.hasNext())) break;
      await adapter.nextPage(); await wait(); page++;
    }
    perYear[year] = count;
  }
  return { rows: all, perYear, aborted: !!signal?.aborted };
}
