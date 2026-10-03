import type { EnrichedRow } from './types'

export interface UnitStats {
  /** 상품 1개당 가격(판매가)이 가장 큰 행. 같으면 더 최근 거래 */
  top: EnrichedRow | null
  totalQty: number
  /** 총 지출 / 총 수량 = 상품 1개당 평균 가격 */
  avgUnit: number
}

/** 요약 지표는 가격 x 수량(금액)이 아니라 상품 1개당 가격 기준이다 */
export function unitStats(rows: EnrichedRow[]): UnitStats {
  let top: EnrichedRow | null = null
  let totalQty = 0
  let total = 0
  for (const r of rows) {
    if (!top || r.price > top.price || (r.price === top.price && r.dt > top.dt)) top = r
    totalQty += r.qty
    total += r.amount
  }
  return { top, totalQty, avgUnit: totalQty ? total / totalQty : 0 }
}
