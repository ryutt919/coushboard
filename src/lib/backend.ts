import type { ImportMeta, SettingsBundle, StoredData } from './stored'
import { applyReceipts, applyReplaceOrders, emptyStored, setRecord } from './stored'
import type { OrderRow, ReceiptRow, RulesConfig } from './types'

/** 저장소 추상화: Supabase(로그인 사용자)와 메모리(예시 화면) 두 구현 */
export interface Backend {
  mode: 'user' | 'demo'
  /** 배송비를 저장할 수 있는지(DB에 shipping_fee 컬럼이 있는지). 없으면 배송비는 저장하지 않고 안내한다 */
  supportsShipping: boolean
  load(): Promise<StoredData>
  setRowOverride(key: string, category: string | null): Promise<void>
  setGroupOverride(base: string, category: string | null): Promise<void>
  saveRules(rules: RulesConfig): Promise<void>
  setMerge(fromBase: string, toGroup: string | null): Promise<void>
  setDedupe(key: string, action: 'keep' | 'drop' | null): Promise<void>
  /** 설정 전체를 교체(가져오기, 초기화) */
  replaceSettings(bundle: SettingsBundle): Promise<void>
  importOrders(meta: { file_name: string; file_sha256: string }, rows: OrderRow[]): Promise<void>
  /** 이미 저장된 주문의 배송비를 주문 단위로 정한다(그 주문의 첫 행에 담고 나머지 행은 비운다) */
  setOrderShipping(updates: { order_no: string; fee: number }[]): Promise<void>
  importReceipts(meta: { file_name: string; file_sha256: string }, rows: ReceiptRow[]): Promise<void>
  deleteAll(): Promise<void>
  exportAll(): Promise<Record<string, unknown>>
}

export class DuplicateFileError extends Error {
  constructor() {
    super('이미 올린 파일입니다.')
    this.name = 'DuplicateFileError'
  }
}

/** 예시 화면용: 네트워크 없이 메모리에만 저장 */
export class MemoryBackend implements Backend {
  mode = 'demo' as const
  supportsShipping = true
  private data: StoredData

  constructor(initial?: StoredData) {
    this.data = initial ?? emptyStored()
  }

  async load(): Promise<StoredData> {
    return structuredClone(this.data)
  }
  async setRowOverride(key: string, category: string | null) {
    this.data.overrides = { ...this.data.overrides, row: setRecord(this.data.overrides.row, key, category) }
  }
  async setGroupOverride(base: string, category: string | null) {
    this.data.overrides = { ...this.data.overrides, group: setRecord(this.data.overrides.group, base, category) }
  }
  async saveRules(rules: RulesConfig) {
    this.data.rules = rules
  }
  async setMerge(fromBase: string, toGroup: string | null) {
    this.data.merges = setRecord(this.data.merges, fromBase, toGroup)
  }
  async setDedupe(key: string, action: 'keep' | 'drop' | null) {
    this.data.dedupe = setRecord(this.data.dedupe, key, action)
  }
  async replaceSettings(b: SettingsBundle) {
    this.data.rules = b.rules ?? null
    this.data.overrides = b.overrides
    this.data.merges = b.merges
    this.data.dedupe = b.dedupe
  }
  private addImport(kind: ImportMeta['kind'], meta: { file_name: string; file_sha256: string }, count: number) {
    if (this.data.imports.some((i) => i.kind === kind && i.file_sha256 === meta.file_sha256)) throw new DuplicateFileError()
    this.data.imports.push({ id: crypto.randomUUID(), kind, row_count: count, created_at: new Date().toISOString(), ...meta })
  }
  async importOrders(meta: { file_name: string; file_sha256: string }, rows: OrderRow[]) {
    this.addImport('orders', meta, rows.length)
    this.data.orders = applyReplaceOrders(this.data.orders, rows)
  }
  async importReceipts(meta: { file_name: string; file_sha256: string }, rows: ReceiptRow[]) {
    this.addImport('receipts', meta, rows.length)
    this.data.receipts = applyReceipts(this.data.receipts, rows)
  }
  async setOrderShipping(updates: { order_no: string; fee: number }[]) {
    const fees = new Map(updates.map((u) => [u.order_no, u.fee]))
    this.data.orders = this.data.orders.map((o) => (fees.has(o.order_no) ? { ...o, shipping_fee: o.seq === 0 ? fees.get(o.order_no)! : null } : o))
  }
  async deleteAll() {
    this.data = emptyStored()
  }
  async exportAll() {
    return { ...structuredClone(this.data) }
  }
}
