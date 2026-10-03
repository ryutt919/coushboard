import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseOrdersCsv, parseReceiptsCsv, sha256Hex } from '../../src/lib/csv'
import { runPipelineFromRows } from '../../src/lib/pipeline'
import { DEFAULT_MERGES, DEFAULT_RULES } from '../../src/lib/stored'
import { SupabaseBackend } from '../../src/lib/supabaseBackend'
import type { OrderRow } from '../../src/lib/types'
import { fx, PERIODS, STATUSES3 } from '../helpers'
import { dbEnabled, login } from './helpers'

const wipe = (c: SupabaseClient) => c.from('imports').delete().gte('user_id', '00000000-0000-0000-0000-000000000000')

describe.skipIf(!dbEnabled)('H9: 저장 왕복', () => {
  let client: SupabaseClient
  let backend: SupabaseBackend

  beforeAll(async () => {
    client = (await login('A')).client
    await wipe(client)
    backend = new SupabaseBackend(client)
    await backend.deleteAll()
  })
  afterAll(async () => {
    await backend?.deleteAll()
  })

  it('픽스처를 실제 업로드 경로로 저장했다 읽어도 expected_with_receipts와 완전히 같다', async () => {
    const ordersText = fx('orders_fixture.csv')
    const receiptsText = fx('receipts_fixture.csv')
    const po = parseOrdersCsv(ordersText)
    const pr = parseReceiptsCsv(receiptsText)
    await backend.importOrders({ file_name: 'orders_fixture.csv', file_sha256: await sha256Hex(new TextEncoder().encode(ordersText)) }, po.rows)
    await backend.importReceipts({ file_name: 'receipts_fixture.csv', file_sha256: await sha256Hex(new TextEncoder().encode(receiptsText)) }, pr.rows)

    const stored = await backend.load()
    expect(stored.orders).toHaveLength(21)
    expect(stored.receipts).toHaveLength(4)
    // 탭 붙은 ID, 시각, 중복 행 순서(seq_in_order)가 저장 과정에서 바뀌지 않았다
    expect(stored.orders.map((o) => [o.order_no, o.seq, o.ordered_at, o.product_no])).toEqual(po.rows.map((o) => [o.order_no, o.seq, o.ordered_at, o.product_no]))

    const result = runPipelineFromRows(stored.orders, stored.receipts, { rules: DEFAULT_RULES, merges: DEFAULT_MERGES, periods: PERIODS, statuses: [...STATUSES3] })
    expect(result).toEqual(JSON.parse(fx('expected_with_receipts.json')))
  })

  it('같은 파일을 다시 올리면 막힌다', async () => {
    const ordersText = fx('orders_fixture.csv')
    const po = parseOrdersCsv(ordersText)
    await expect(backend.importOrders({ file_name: 'again.csv', file_sha256: await sha256Hex(new TextEncoder().encode(ordersText)) }, po.rows)).rejects.toThrow('이미 올린 파일')
    expect((await backend.load()).orders).toHaveLength(21)
  })

  it('저장이 실패하면 아무것도 바뀌지 않는다(업로드 이력도 남지 않는다)', async () => {
    const bad = parseOrdersCsv(fx('orders_fixture.csv')).rows.slice(0, 2).map((r) => ({ ...r, order_no: '5000000000001', status: '알수없음' }))
    await expect(backend.importOrders({ file_name: 'bad.csv', file_sha256: 'e'.repeat(64) }, bad)).rejects.toThrow()
    const stored = await backend.load()
    expect(stored.orders).toHaveLength(21)
    expect(stored.imports.some((i) => i.file_name === 'bad.csv')).toBe(false)
  })

  it('설정(지정, 규칙, 합치기, 중복 설정)이 저장되고 다시 읽힌다', async () => {
    await backend.setRowOverride('1000000000004:0', '생활용품')
    await backend.setGroupOverride('쿠쿠 전기보온 에그밥솥 6인용', '생활용품')
    await backend.saveRules({ ...DEFAULT_RULES, exclusions: [{ keyword: '밥', base: 'x' }] })
    await backend.setMerge('가', '나')
    await backend.setDedupe('1000000000001:1', 'keep')
    let s = await backend.load()
    expect(s.overrides).toEqual({ row: { '1000000000004:0': '생활용품' }, group: { '쿠쿠 전기보온 에그밥솥 6인용': '생활용품' } })
    expect(s.rules?.exclusions).toEqual([{ keyword: '밥', base: 'x' }])
    expect(s.merges).toEqual({ 가: '나' })
    expect(s.dedupe).toEqual({ '1000000000001:1': 'keep' })
    await backend.setRowOverride('1000000000004:0', null)
    s = await backend.load()
    expect(s.overrides.row).toEqual({})
  })

  it('배송비가 저장되고 읽히며, 이미 저장된 주문에 합쳐 넣을 수 있다', async () => {
    await backend.deleteAll()
    const mk = (seq: number, fee: number | null): OrderRow => ({
      order_no: '3000000000001', seq, ordered_at: '2026-06-03 00:00:00', bundle_no: null, product_no: String(700 + seq),
      status: '배송완료', raw_name: `배송비테스트 ${seq}`, qty: 1, list_price: null, sale_price: 1000, seller: null, shipping_fee: fee,
    })
    await backend.importOrders({ file_name: 'ship.csv', file_sha256: 'a1'.repeat(32) }, [mk(0, 3000), mk(1, null)])
    let s = await backend.load()
    expect(s.orders.map((o) => o.shipping_fee)).toEqual([3000, null])
    // 주문 단위로 합쳐 넣으면 첫 행에 담기고 나머지는 비워진다
    await backend.setOrderShipping([{ order_no: '3000000000001', fee: 9000 }])
    s = await backend.load()
    expect(s.orders.map((o) => o.shipping_fee)).toEqual([9000, null])
  })

  it('페이지 나누기: 2,500행을 넣고 불러오면 2,500행이다(1000행 제한 회귀 방지)', async () => {
    await backend.deleteAll()
    const rows: OrderRow[] = []
    for (let i = 0; i < 2500; i++) {
      rows.push({
        order_no: String(2000000000000 + Math.floor(i / 3)),
        seq: i % 3,
        ordered_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')} 10:00:00`,
        bundle_no: null,
        product_no: String(100 + (i % 50)),
        status: '배송완료',
        raw_name: `테스트상품 ${i % 50}, 1개`,
        qty: 1,
        list_price: null,
        sale_price: 1000 + (i % 7),
        seller: null,
      })
    }
    await backend.importOrders({ file_name: 'bulk.csv', file_sha256: 'f'.repeat(64) }, rows)
    const s = await backend.load()
    expect(s.orders).toHaveLength(2500)
  })

  it('전체 삭제 후에는 모두 비어 있다', async () => {
    await backend.deleteAll()
    const s = await backend.load()
    expect(s.orders).toHaveLength(0)
    expect(s.imports).toHaveLength(0)
    expect(s.rules).toBeNull()
    expect(s.overrides).toEqual({ row: {}, group: {} })
  })
})
