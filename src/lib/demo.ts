// 예시 화면용 가짜(mock) 주문 데이터. 실제 구매 데이터가 아니며 시드 고정이라 항상 같은 결과가 나온다.
import { addDays } from './dates'
import { csvEscape } from './format'
import { emptyStored, type StoredData } from './stored'
import type { OrderRow, ReceiptRow } from './types'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Item {
  name: string
  price: [number, number]
  weight: number // 구매 빈도 가중치
}

const ITEMS: Item[] = [
  { name: '청담샘 무라벨 생수, 2L, 12개', price: [6200, 7200], weight: 9 },
  { name: '푸른들 무항생제 대란, 30구, 1개', price: [7900, 9400], weight: 8 },
  { name: '바삭마을 오리지널 포카칩, 350g, 3개', price: [6900, 8200], weight: 3 },
  { name: '해든 제로 콜라 라임향, 500ml, 24개', price: [17800, 21900], weight: 6 },
  { name: '남도 우유 1등급, 1L, 6개', price: [9800, 11400], weight: 7 },
  { name: '곡물나라 오곡 시리얼, 420g, 2개', price: [8900, 11800], weight: 4 },
  { name: '마켓온 냉동 닭가슴살, 1kg, 1개', price: [8800, 10400], weight: 5 },
  { name: '한뜰 신선 대파, 1kg, 1개', price: [2400, 3200], weight: 4 },
  { name: '밀양 햇반형 즉석밥, 210g, 12개', price: [11900, 14500], weight: 3 },
  { name: '새벽 원두커피 블렌드, 1kg, 1개', price: [16900, 22900], weight: 2 },
  { name: '말랑 부드러운 3겹 화장지, 30m, 30롤', price: [9900, 12900], weight: 4 },
  { name: '깔끔 주방 세제 리필, 1.2L, 3개', price: [7400, 9800], weight: 3 },
  { name: '튼튼 지퍼백 대형, 20매, 3개', price: [4900, 6900], weight: 2 },
  { name: '반짝 섬유유연제, 2.5L, 2개', price: [11800, 15200], weight: 3 },
  { name: '청결 물티슈 캡형, 100매, 10개', price: [9900, 13900], weight: 3 },
  { name: '프레쉬 핸드워시 레몬향, 450ml, 3개', price: [8900, 10900], weight: 3 },
  { name: '맑은결 약산성 클렌저, 150ml, 1개', price: [9800, 13900], weight: 2 },
  { name: '라온 칫솔 극세모, 12개입, 1개', price: [5900, 8900], weight: 2 },
  { name: '더순한 바디로션, 500ml, 2개', price: [11900, 15900], weight: 2 },
  { name: '건강지기 종합 비타민, 120정, 1개', price: [14900, 22900], weight: 2 },
  { name: '튼튼관절 오메가3 캡슐, 60정, 2개', price: [17900, 26900], weight: 2 },
  { name: '편안한 무릎 보호대, 블랙', price: [14900, 24900], weight: 1 },
  { name: '온열 목어깨 마사지기, 화이트', price: [39900, 69900], weight: 1 },
  { name: '러너스 요가 매트 10mm, 그레이', price: [14900, 21900], weight: 1 },
  { name: '파워핏 덤벨 세트 10kg, 블랙', price: [29900, 44900], weight: 1 },
  { name: '스포츠 면테이프 3.5cm, 18개, 1개입', price: [21900, 25900], weight: 1 },
  { name: '위브 USB-C 고속 충전 케이블 2m, 화이트', price: [7900, 12900], weight: 2 },
  { name: '비트 무선 마우스 저소음, 블랙', price: [14900, 24900], weight: 1 },
  { name: '프로텍트 아이폰 케이스, 투명', price: [9900, 17900], weight: 1 },
  { name: '라이트 책상 거치대 알루미늄, 실버', price: [18900, 27900], weight: 1 },
  { name: '미니 전기 토스터 오븐 12L', price: [49900, 79900], weight: 1 },
  { name: '아늑 원목 3단 서랍장, 내추럴', price: [59900, 99900], weight: 1 },
  { name: '시원 탁상용 써큘레이터 선풍기, 화이트', price: [29900, 45900], weight: 1 },
  { name: '포근 사계절 토퍼, 퀸', price: [49900, 89900], weight: 1 },
]

const SELLERS = ['예시마트(주)', '모의상회', '샘플스토어']

function pad(n: number, w = 2) {
  return String(n).padStart(w, '0')
}

export const DEMO_END = '2026-09-28'

export function generateDemo(): { orders: OrderRow[]; receipts: ReceiptRow[] } {
  const rand = rng(20261002)
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  const total = ITEMS.reduce((a, i) => a + i.weight, 0)
  const weighted = () => {
    let x = rand() * total
    for (const it of ITEMS) {
      x -= it.weight
      if (x <= 0) return it
    }
    return ITEMS[0]
  }

  const orders: OrderRow[] = []
  let orderSeq = 0
  const addOrder = (date: string, items: { item: Item; price: number; qty: number; status: string; dup?: boolean }[]) => {
    orderSeq += 1
    const order_no = `9001${pad(orderSeq, 9)}`
    const time = `${pad(7 + Math.floor(rand() * 15))}:${pad(Math.floor(rand() * 60))}:${pad(Math.floor(rand() * 60))}`
    const bundle = `9101${pad(orderSeq, 9)}`
    let seq = 0
    for (const it of items) {
      const copies = it.dup ? 2 : 1 // 내보내기 중복 행 재현
      for (let c = 0; c < copies; c++) {
        orders.push({
          order_no,
          seq: seq++,
          ordered_at: `${date} ${time}`,
          bundle_no: bundle,
          product_no: String(8000000 + ITEMS.indexOf(it.item) * 37 + 11),
          status: it.status,
          raw_name: it.item.name,
          qty: it.qty,
          list_price: Math.round(it.price * 1.08),
          sale_price: it.price,
          seller: pick(SELLERS),
        })
      }
    }
    return order_no
  }

  // 날짜 범위: 2024-11 ~ 2026-09. 2025-03 이전은 드문드문, 이후는 매달.
  const startDay = '2024-11-04'
  const days = 693 // 2024-11-04 ~ 2026-09-28
  let dupOrder = ''
  for (let d = 0; d <= days; d++) {
    const date = addDays(startDay, d)
    const sparse = date < '2025-03-01'
    const p = sparse ? 0.06 : 0.32
    if (rand() > p) continue
    const n = 1 + Math.floor(rand() * 4)
    const items = []
    for (let i = 0; i < n; i++) {
      const item = weighted()
      const price = Math.round((item.price[0] + rand() * (item.price[1] - item.price[0])) / 10) * 10
      const r = rand()
      const status = date > '2026-09-25' ? '배송중' : r < 0.04 ? '반품완료' : r < 0.07 ? '취소완료' : r < 0.09 ? '교환완료' : '배송완료'
      items.push({ item, price, qty: item.price[1] < 15000 && rand() < 0.15 ? 2 : 1, status, dup: false })
    }
    // 같은 상품이 한 주문에 두 번 겹친 내보내기 중복(영수증 대조 사례용)
    if (!dupOrder && date >= '2026-02-01' && items[0].status === '배송완료') items[0].dup = true
    const no = addOrder(date, items)
    if (items[0].dup && !dupOrder) dupOrder = no
  }

  // 영수증: 일부 주문만. 중복 사례 주문은 실제로 2개 산 것으로 찍힌다(복원 사례).
  const receipts: ReceiptRow[] = []
  const byOrder = new Map<string, OrderRow[]>()
  for (const o of orders) byOrder.set(o.order_no, [...(byOrder.get(o.order_no) ?? []), o])
  let k = 0
  for (const [order_no, rows] of byOrder) {
    if (order_no !== dupOrder && rand() > 0.07) continue
    k += 1
    const sum = rows.reduce((a, r) => a + r.sale_price * r.qty, 0)
    receipts.push({
      receipt_key: `demo-${pad(k, 4)}`,
      order_no,
      paid_at: rows[0].ordered_at,
      item_name: rows[0].raw_name.split(',')[0],
      item_count: rows.length,
      total: sum + (rand() < 0.2 ? 3000 : 0),
    })
  }
  return { orders, receipts }
}

export function demoStored(): StoredData {
  const { orders, receipts } = generateDemo()
  const s = emptyStored()
  s.orders = orders
  s.receipts = receipts
  return s
}

export const ORDER_CSV_HEADER = '주문번호,주문일시,묶음배송번호,상품번호,상태,상품명,수량,정가,판매가,금액(판매가x수량),중복표시의심,정리본포함,주문별합계(정가기준),판매자'

/** 쿠팡 주문목록 CSV와 같은 열 구성(탭 붙은 ID, BOM 포함)으로 내려받을 수 있게 만든다 */
export function ordersToCsv(rows: OrderRow[]): string {
  const lines = rows.map((r) =>
    [
      '\t' + r.order_no,
      r.ordered_at,
      '\t' + (r.bundle_no ?? ''),
      '\t' + r.product_no,
      r.status,
      r.raw_name,
      r.qty,
      r.list_price ?? '',
      r.sale_price,
      r.sale_price * r.qty,
      '',
      '',
      '',
      r.seller ?? '',
    ]
      .map(csvEscape)
      .join(','),
  )
  return '﻿' + [ORDER_CSV_HEADER, ...lines].join('\r\n') + '\r\n'
}
