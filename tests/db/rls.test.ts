import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbEnabled, login, newClient } from './helpers'

const A_IMPORT = '11111111-1111-4111-8111-111111111111'
const sha = (c: string) => c.repeat(64)

const row = (seq: number, status = '배송완료') => ({
  order_no: '1000000000001',
  seq_in_order: seq,
  ordered_at: '2024-11-03 10:00:00',
  product_no: '501',
  status,
  raw_name: '탐사수 무라벨, 2L, 12개',
  qty: 1,
  list_price: 6790,
  sale_price: 6790,
})

describe.skipIf(!dbEnabled)('H8: RLS와 권한 (supabase-js 경로)', () => {
  let a: { client: SupabaseClient; userId: string }
  let b: { client: SupabaseClient; userId: string }
  const anon = dbEnabled ? newClient() : (null as unknown as SupabaseClient)

  beforeAll(async () => {
    a = await login('A')
    b = await login('B')
    await a.client.from('imports').delete().gte('user_id', '00000000-0000-0000-0000-000000000000')
    await b.client.from('imports').delete().gte('user_id', '00000000-0000-0000-0000-000000000000')
  })

  afterAll(async () => {
    await a?.client.from('imports').delete().gte('user_id', '00000000-0000-0000-0000-000000000000')
    await b?.client.from('imports').delete().gte('user_id', '00000000-0000-0000-0000-000000000000')
  })

  it('A: 입력하고 같은 주문번호로 다시 올리면 교체된다', async () => {
    const ins = await a.client.from('imports').insert({ id: A_IMPORT, kind: 'orders', file_name: 'a.csv', file_sha256: sha('a'), row_count: 2 })
    expect(ins.error).toBeNull()
    const r1 = await a.client.rpc('replace_orders', { p_import_id: A_IMPORT, p_rows: [row(0), row(1)] })
    expect(r1.error).toBeNull()
    expect((await a.client.from('order_items').select('id')).data).toHaveLength(2)
    const r2 = await a.client.rpc('replace_orders', { p_import_id: A_IMPORT, p_rows: [row(0, '반품완료')] })
    expect(r2.error).toBeNull()
    const after = await a.client.from('order_items').select('status')
    expect(after.data).toEqual([{ status: '반품완료' }])
  })

  it('B: A의 행과 업로드 이력이 보이지 않는다', async () => {
    expect((await b.client.from('order_items').select('id')).data).toHaveLength(0)
    expect((await b.client.from('imports').select('id')).data).toHaveLength(0)
  })

  it('B: A의 user_id로 쓰기를 시도하면 거부된다', async () => {
    const r = await b.client.from('imports').insert({ user_id: a.userId, kind: 'orders', file_name: 'x.csv', file_sha256: sha('b'), row_count: 0 })
    expect(r.error).not.toBeNull()
    expect(r.error!.code).toBe('42501')
  })

  it('B: A의 import로 replace_orders를 부르면 거부된다', async () => {
    const r = await b.client.rpc('replace_orders', { p_import_id: A_IMPORT, p_rows: [] })
    expect(r.error?.message).toContain('import not found')
  })

  it('B: 수정과 삭제가 A의 행에 영향을 주지 않는다', async () => {
    await b.client.from('order_items').delete().gte('id', 0)
    await b.client.from('order_items').update({ qty: 99 }).gte('id', 0)
    const mine = await a.client.from('order_items').select('qty')
    expect(mine.data).toEqual([{ qty: 1 }])
  })

  it('anon: 조회와 함수 실행이 거부된다', async () => {
    const t = await anon.from('order_items').select('id')
    expect(t.error).not.toBeNull()
    expect(t.data ?? []).toHaveLength(0)
    const f = await anon.rpc('replace_orders', { p_import_id: A_IMPORT, p_rows: [] })
    expect(f.error).not.toBeNull()
    const g = await anon.rpc('replace_receipts', { p_import_id: A_IMPORT, p_rows: [] })
    expect(g.error).not.toBeNull()
  })

  it('anon: 모든 설정 테이블도 거부된다', async () => {
    for (const t of ['imports', 'receipts', 'category_rules', 'category_overrides', 'product_merges', 'dedupe_overrides']) {
      const r = await anon.from(t).select('*')
      expect(r.error, t).not.toBeNull()
    }
  })

  it('같은 파일(SHA-256)의 imports를 두 번 넣을 수 없다', async () => {
    const r = await a.client.from('imports').insert({ kind: 'orders', file_name: 'dup.csv', file_sha256: sha('a'), row_count: 1 })
    expect(r.error?.code).toBe('23505')
  })

  it('영수증도 사용자별로 격리되고, 같은 receipt_key는 교체된다', async () => {
    const imp = await a.client.from('imports').insert({ kind: 'receipts', file_name: 'r.csv', file_sha256: sha('c'), row_count: 1 }).select('id').single()
    expect(imp.error).toBeNull()
    const rec = (total: number) => ({ receipt_key: 'k1', order_no: '1000000000001', paid_at: '2024-11-03 10:00:00', item_name: 'x', item_count: null, total })
    expect((await a.client.rpc('replace_receipts', { p_import_id: imp.data!.id, p_rows: [rec(100)] })).error).toBeNull()
    expect((await a.client.rpc('replace_receipts', { p_import_id: imp.data!.id, p_rows: [rec(200)] })).error).toBeNull()
    expect((await a.client.from('receipts').select('total')).data).toEqual([{ total: 200 }])
    expect((await b.client.from('receipts').select('total')).data).toHaveLength(0)
    const stolen = await b.client.rpc('replace_receipts', { p_import_id: imp.data!.id, p_rows: [rec(1)] })
    expect(stolen.error?.message).toContain('import not found')
  })

  it('설정 테이블도 사용자별로 격리된다', async () => {
    expect((await a.client.from('category_overrides').upsert({ scope: 'group', target: '품목', category: '생활용품' }, { onConflict: 'user_id,scope,target' })).error).toBeNull()
    expect((await a.client.from('category_rules').upsert({ rules: { fallback: 'x', categories: [] } }, { onConflict: 'user_id' })).error).toBeNull()
    expect((await b.client.from('category_overrides').select('*')).data).toHaveLength(0)
    expect((await b.client.from('category_rules').select('*')).data).toHaveLength(0)
    const forged = await b.client.from('category_overrides').insert({ user_id: a.userId, scope: 'row', target: 'z', category: 'x' })
    expect(forged.error?.code).toBe('42501')
  })
})
