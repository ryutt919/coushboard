import type { SupabaseClient } from '@supabase/supabase-js'
import { type Backend, DuplicateFileError } from './backend'
import type { ImportMeta, SettingsBundle, StoredData } from './stored'
import { emptyStored } from './stored'
import type { OrderRow, ReceiptRow, RulesConfig } from './types'

/** PostgREST 한 번 응답 행 수 제한(기본 1000)을 넘지 않도록 range()로 끝까지 읽는다. */
export const PAGE_SIZE = 1000

export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`데이터를 읽지 못했습니다: ${error.message}`)
    const page = data ?? []
    out.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return out
}

const ts = (v: string) => v.replace('T', ' ').slice(0, 19)
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

interface OrderDb {
  order_no: string
  seq_in_order: number
  ordered_at: string
  bundle_no: string | null
  product_no: string
  status: string
  raw_name: string
  qty: number
  list_price: number | null
  sale_price: number
  seller: string | null
}

interface ReceiptDb {
  receipt_key: string
  order_no: string
  paid_at: string
  item_name: string | null
  item_count: number | null
  total: number
}

export class SupabaseBackend implements Backend {
  mode = 'user' as const
  constructor(private db: SupabaseClient) {}

  async load(): Promise<StoredData> {
    const db = this.db
    const [imports, orders, receipts, rules, overrides, merges, dedupe] = await Promise.all([
      fetchAllPages<ImportMeta>((f, t) =>
        db.from('imports').select('id,kind,file_name,file_sha256,row_count,created_at').order('created_at').range(f, t),
      ),
      fetchAllPages<OrderDb>((f, t) =>
        db
          .from('order_items')
          .select('order_no,seq_in_order,ordered_at,bundle_no,product_no,status,raw_name,qty,list_price,sale_price,seller')
          .order('id')
          .range(f, t),
      ),
      fetchAllPages<ReceiptDb>((f, t) =>
        db.from('receipts').select('receipt_key,order_no,paid_at,item_name,item_count,total').order('id').range(f, t),
      ),
      db.from('category_rules').select('rules').maybeSingle(),
      fetchAllPages<{ scope: 'row' | 'group'; target: string; category: string }>((f, t) =>
        db.from('category_overrides').select('scope,target,category').order('target').range(f, t),
      ),
      fetchAllPages<{ from_base: string; to_group: string }>((f, t) =>
        db.from('product_merges').select('from_base,to_group').order('from_base').range(f, t),
      ),
      fetchAllPages<{ order_no: string; seq_in_order: number; action: 'keep' | 'drop' }>((f, t) =>
        db.from('dedupe_overrides').select('order_no,seq_in_order,action').order('order_no').order('seq_in_order').range(f, t),
      ),
    ])
    if (rules.error) throw new Error(`규칙을 읽지 못했습니다: ${rules.error.message}`)
    const s = emptyStored()
    s.imports = imports
    s.orders = orders.map((o) => ({
      order_no: o.order_no,
      seq: o.seq_in_order,
      ordered_at: ts(o.ordered_at),
      bundle_no: o.bundle_no,
      product_no: o.product_no,
      status: o.status,
      raw_name: o.raw_name,
      qty: o.qty,
      list_price: o.list_price,
      sale_price: o.sale_price,
      seller: o.seller,
    }))
    s.receipts = receipts.map((r) => ({ ...r, paid_at: ts(r.paid_at) }))
    s.rules = (rules.data?.rules as RulesConfig | undefined) ?? null
    for (const o of overrides) s.overrides[o.scope][o.target] = o.category
    for (const m of merges) s.merges[m.from_base] = m.to_group
    for (const d of dedupe) s.dedupe[`${d.order_no}:${d.seq_in_order}`] = d.action
    return s
  }

  private check(error: { message: string } | null, what: string) {
    if (error) throw new Error(`${what} 저장에 실패했습니다: ${error.message}`)
  }

  private async setOverride(scope: 'row' | 'group', target: string, category: string | null) {
    if (category === null) {
      const { error } = await this.db.from('category_overrides').delete().eq('scope', scope).eq('target', target)
      this.check(error, '카테고리 지정')
    } else {
      const { error } = await this.db
        .from('category_overrides')
        .upsert({ scope, target, category, updated_at: new Date().toISOString() }, { onConflict: 'user_id,scope,target' })
      this.check(error, '카테고리 지정')
    }
  }
  setRowOverride(key: string, category: string | null) {
    return this.setOverride('row', key, category)
  }
  setGroupOverride(base: string, category: string | null) {
    return this.setOverride('group', base, category)
  }

  async saveRules(rules: RulesConfig) {
    const { error } = await this.db
      .from('category_rules')
      .upsert({ rules, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    this.check(error, '규칙')
  }

  async setMerge(fromBase: string, toGroup: string | null) {
    if (toGroup === null) {
      const { error } = await this.db.from('product_merges').delete().eq('from_base', fromBase)
      this.check(error, '품목 병합')
    } else {
      const { error } = await this.db
        .from('product_merges')
        .upsert({ from_base: fromBase, to_group: toGroup }, { onConflict: 'user_id,from_base' })
      this.check(error, '품목 병합')
    }
  }

  async setDedupe(key: string, action: 'keep' | 'drop' | null) {
    const i = key.lastIndexOf(':')
    const order_no = key.slice(0, i)
    const seq = Number(key.slice(i + 1))
    if (action === null) {
      const { error } = await this.db.from('dedupe_overrides').delete().eq('order_no', order_no).eq('seq_in_order', seq)
      this.check(error, '중복 설정')
    } else {
      const { error } = await this.db
        .from('dedupe_overrides')
        .upsert({ order_no, seq_in_order: seq, action }, { onConflict: 'user_id,order_no,seq_in_order' })
      this.check(error, '중복 설정')
    }
  }

  private async wipeSettings() {
    for (const t of ['category_rules', 'category_overrides', 'product_merges', 'dedupe_overrides']) {
      const { error } = await this.db.from(t).delete().gte('user_id', ZERO_UUID)
      this.check(error, '설정 초기화')
    }
  }

  async replaceSettings(b: SettingsBundle) {
    await this.wipeSettings()
    if (b.rules) await this.saveRules(b.rules)
    const ov = [
      ...Object.entries(b.overrides.row).map(([target, category]) => ({ scope: 'row', target, category })),
      ...Object.entries(b.overrides.group).map(([target, category]) => ({ scope: 'group', target, category })),
    ]
    for (let i = 0; i < ov.length; i += 500) {
      const { error } = await this.db.from('category_overrides').insert(ov.slice(i, i + 500))
      this.check(error, '카테고리 지정')
    }
    const mg = Object.entries(b.merges).map(([from_base, to_group]) => ({ from_base, to_group }))
    for (let i = 0; i < mg.length; i += 500) {
      const { error } = await this.db.from('product_merges').insert(mg.slice(i, i + 500))
      this.check(error, '품목 병합')
    }
    const dd = Object.entries(b.dedupe).map(([k, action]) => {
      const j = k.lastIndexOf(':')
      return { order_no: k.slice(0, j), seq_in_order: Number(k.slice(j + 1)), action }
    })
    for (let i = 0; i < dd.length; i += 500) {
      const { error } = await this.db.from('dedupe_overrides').insert(dd.slice(i, i + 500))
      this.check(error, '중복 설정')
    }
  }

  private async createImport(kind: 'orders' | 'receipts', meta: { file_name: string; file_sha256: string }, count: number): Promise<string> {
    const dup = await this.db.from('imports').select('id').eq('kind', kind).eq('file_sha256', meta.file_sha256).limit(1)
    if (dup.error) throw new Error(`업로드 이력을 확인하지 못했습니다: ${dup.error.message}`)
    if (dup.data && dup.data.length) throw new DuplicateFileError()
    const ins = await this.db
      .from('imports')
      .insert({ kind, file_name: meta.file_name, file_sha256: meta.file_sha256, row_count: count })
      .select('id')
      .single()
    if (ins.error) {
      if (ins.error.code === '23505') throw new DuplicateFileError()
      throw new Error(`업로드 이력을 만들지 못했습니다: ${ins.error.message}`)
    }
    return ins.data.id as string
  }

  private async dropImport(id: string) {
    await this.db.from('imports').delete().eq('id', id)
  }

  async importOrders(meta: { file_name: string; file_sha256: string }, rows: OrderRow[]) {
    const id = await this.createImport('orders', meta, rows.length)
    const payload = rows.map((r) => ({
      order_no: r.order_no,
      seq_in_order: r.seq,
      ordered_at: r.ordered_at,
      bundle_no: r.bundle_no,
      product_no: r.product_no,
      status: r.status,
      raw_name: r.raw_name,
      qty: r.qty,
      list_price: r.list_price,
      sale_price: r.sale_price,
      seller: r.seller,
    }))
    const { error } = await this.db.rpc('replace_orders', { p_import_id: id, p_rows: payload })
    if (error) {
      await this.dropImport(id) // 저장이 실패하면 아무것도 바뀌지 않는다
      throw new Error(`주문 저장에 실패했습니다: ${error.message}`)
    }
  }

  async importReceipts(meta: { file_name: string; file_sha256: string }, rows: ReceiptRow[]) {
    const id = await this.createImport('receipts', meta, rows.length)
    const payload = rows.map((r) => ({
      receipt_key: r.receipt_key,
      order_no: r.order_no,
      paid_at: r.paid_at,
      item_name: r.item_name,
      item_count: r.item_count,
      total: r.total,
    }))
    const { error } = await this.db.rpc('replace_receipts', { p_import_id: id, p_rows: payload })
    if (error) {
      await this.dropImport(id)
      throw new Error(`영수증 저장에 실패했습니다: ${error.message}`)
    }
  }

  async deleteAll() {
    // imports를 지우면 order_items, receipts가 연쇄 삭제된다
    const first = await this.db.from('imports').delete().gte('user_id', ZERO_UUID)
    this.check(first.error, '전체 삭제')
    await this.wipeSettings()
  }

  async exportAll() {
    const s = await this.load()
    return { exported_at: new Date().toISOString(), ...s }
  }
}
