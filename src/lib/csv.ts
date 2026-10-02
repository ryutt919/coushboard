import Papa from 'papaparse'
import { cleanId } from './normalize'
import type { OrderRow, ReceiptRow } from './types'
import { STATUSES } from './types'

export const REQUIRED_ORDER_COLUMNS = ['주문번호', '주문일시', '상품번호', '상태', '상품명', '수량', '판매가'] as const
export const OPTIONAL_ORDER_COLUMNS = ['묶음배송번호', '정가', '판매자'] as const
export type OrderColumn = (typeof REQUIRED_ORDER_COLUMNS)[number] | (typeof OPTIONAL_ORDER_COLUMNS)[number]
/** 필수/선택 열 이름 -> 파일의 실제 헤더 이름 */
export type ColumnMapping = Partial<Record<OrderColumn, string>>

export interface RowIssue {
  line: number // 파일상 줄 번호(헤더=1)
  reason: string
}

export interface ParsedOrders {
  headers: string[]
  missing: string[] // 짝지어지지 않은 필수 열
  rows: OrderRow[]
  issues: RowIssue[]
  totalRows: number
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function parseRaw(text: string): { headers: string[]; records: Record<string, string>[] } {
  const res = Papa.parse<Record<string, string>>(stripBom(text), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  return { headers: res.meta.fields ?? [], records: res.data }
}

const DT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

function toInt(v: string | undefined): number | null {
  const s = (v ?? '').trim().replace(/,/g, '')
  return /^\d+$/.test(s) ? Number(s) : null
}

export function parseOrdersCsv(text: string, mapping: ColumnMapping = {}): ParsedOrders {
  const { headers, records } = parseRaw(text)
  const col = (name: OrderColumn): string | undefined => {
    const m = mapping[name]
    if (m && headers.includes(m)) return m
    return headers.includes(name) ? name : undefined
  }
  const missing = REQUIRED_ORDER_COLUMNS.filter((c) => !col(c))
  if (missing.length) return { headers, missing: [...missing], rows: [], issues: [], totalRows: records.length }

  const issues: RowIssue[] = []
  const rows: OrderRow[] = []
  const seqs = new Map<string, number>()
  const get = (r: Record<string, string>, c: OrderColumn) => {
    const h = col(c)
    return h ? r[h] : undefined
  }
  records.forEach((r, i) => {
    const line = i + 2
    const order_no = cleanId(get(r, '주문번호'))
    const product_no = cleanId(get(r, '상품번호'))
    const ordered_at = (get(r, '주문일시') ?? '').trim()
    const status = (get(r, '상태') ?? '').trim()
    const raw_name = get(r, '상품명') ?? ''
    const qty = toInt(get(r, '수량'))
    const sale_price = toInt(get(r, '판매가'))
    const listRaw = (get(r, '정가') ?? '').trim()
    const list_price = listRaw === '' ? null : toInt(listRaw)
    const problems: string[] = []
    if (!/^\d+$/.test(order_no)) problems.push('주문번호가 숫자가 아님')
    if (!/^\d+$/.test(product_no)) problems.push('상품번호가 숫자가 아님')
    if (!DT_RE.test(ordered_at)) problems.push('주문일시 형식이 YYYY-MM-DD HH:mm:ss가 아님')
    if (!(STATUSES as string[]).includes(status)) problems.push('알 수 없는 주문 상태')
    if (raw_name.trim() === '') problems.push('상품명이 비어 있음')
    if (qty === null || qty <= 0) problems.push('수량이 1 이상의 정수가 아님')
    if (sale_price === null) problems.push('판매가가 정수가 아님')
    if (listRaw !== '' && list_price === null) problems.push('정가가 정수가 아님')
    if (problems.length) {
      issues.push({ line, reason: problems.join(', ') })
      return
    }
    const seq = seqs.get(order_no) ?? 0
    seqs.set(order_no, seq + 1)
    const bundle = cleanId(get(r, '묶음배송번호'))
    const seller = (get(r, '판매자') ?? '').trim()
    rows.push({
      order_no,
      seq,
      ordered_at,
      bundle_no: bundle === '' ? null : bundle,
      product_no,
      status,
      raw_name,
      qty: qty!,
      list_price,
      sale_price: sale_price!,
      seller: seller === '' ? null : seller,
    })
  })
  return { headers, missing: [], rows, issues, totalRows: records.length }
}

export interface ParsedReceipts {
  headers: string[]
  rows: ReceiptRow[]
  issues: RowIssue[]
  missing: string[]
}

const REQUIRED_RECEIPT_COLUMNS = ['receipt_key', 'datetime', 'order_no', 'total'] as const

export function parseReceiptsCsv(text: string): ParsedReceipts {
  const { headers, records } = parseRaw(text)
  const missing = REQUIRED_RECEIPT_COLUMNS.filter((c) => !headers.includes(c))
  if (missing.length) return { headers, rows: [], issues: [], missing: [...missing] }
  const rows: ReceiptRow[] = []
  const issues: RowIssue[] = []
  records.forEach((r, i) => {
    const line = i + 2
    const order_no = cleanId(r.order_no)
    const key = (r.receipt_key ?? '').trim()
    const dt = (r.datetime ?? '').trim().replace('T', ' ')
    const total = toInt(r.total)
    const cntRaw = (r.item_count ?? '').trim()
    const cnt = cntRaw === '' ? null : Math.trunc(Number(cntRaw))
    const problems: string[] = []
    if (!key) problems.push('receipt_key가 비어 있음')
    if (!/^\d+$/.test(order_no)) problems.push('order_no가 숫자가 아님')
    if (!DT_RE.test(dt)) problems.push('datetime 형식 오류')
    if (total === null) problems.push('total이 정수가 아님')
    if (cnt !== null && !(cnt > 0)) problems.push('item_count가 1 이상이 아님')
    if (problems.length) {
      issues.push({ line, reason: problems.join(', ') })
      return
    }
    const name = (r.item_name ?? '').trim()
    rows.push({ receipt_key: key, order_no, paid_at: dt, item_name: name === '' ? null : name, item_count: cnt, total: total! })
  })
  return { headers, rows, issues, missing: [] }
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
