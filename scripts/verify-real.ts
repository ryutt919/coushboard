// 로컬 실데이터 차등 테스트: 같은 파일을 oracle.py와 TS 구현에 돌려 깊은 비교.
// 사용: npm run verify:real -- --orders <경로> [--receipts <경로>]
// 결과와 로그에는 상품명을 출력하지 않는다(경로와 숫자만).
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import rules from '../src/data/category-rules.json'
import merges from '../src/data/product-merges.json'
import { addDays, addMonths } from '../src/lib/dates'
import { runPipeline } from '../src/lib/pipeline'
import type { RulesConfig, StatusFilter } from '../src/lib/types'

const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const ordersPath = arg('--orders')
const receiptsPath = arg('--receipts')
if (!ordersPath) {
  console.log('skipped: --orders 경로가 없습니다')
  process.exit(0)
}
const root = resolve(import.meta.dirname, '..')

function oracle(args: string[]): any {
  for (const py of ['python3', 'python']) {
    const r = spawnSync(py, [resolve(root, 'tools/oracle/oracle.py'), ...args], {
      encoding: 'utf-8',
      maxBuffer: 512 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    if (r.status === 0 && r.stdout) return JSON.parse(r.stdout)
  }
  throw new Error('oracle.py 실행 실패')
}

const statuses: StatusFilter[] = ['ok', 'all', 'ret']
const baseArgs = (periods: string[]) => [
  '--orders', resolve(ordersPath),
  ...(receiptsPath ? ['--receipts', resolve(receiptsPath)] : []),
  '--rules', resolve(root, 'src/data/category-rules.json'),
  '--merges', resolve(root, 'src/data/product-merges.json'),
  ...periods.flatMap((p) => ['--period', p]),
  ...statuses.flatMap((s) => ['--status', s]),
]

// 데이터 끝 날짜를 알아야 "최근 3개월"을 만들 수 있으므로 ALL을 먼저 돌린다.
const probe = oracle(baseArgs(['ALL']))
const end: string = probe.input.data_end
const periods = ['ALL', '2026-01-01:2026-12-31', '2025-01-01:2025-12-31', `${addDays(addMonths(end, -3), 1)}:${end}`, '2026-10-01:2026-10-01']

const expected = oracle(baseArgs(periods))
const ordersCsv = readFileSync(resolve(ordersPath), 'utf-8')
const receiptsCsv = receiptsPath ? readFileSync(resolve(receiptsPath), 'utf-8') : null
const actual = runPipeline({ ordersCsv, receiptsCsv, rules: rules as RulesConfig, merges: merges as Record<string, string>, periods, statuses })

function firstDiff(a: unknown, b: unknown, path: string): { path: string; a: unknown; b: unknown } | null {
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return a === b ? null : { path, a, b }
  }
  if (Array.isArray(a) !== Array.isArray(b)) return { path, a: 'array?', b: 'array?' }
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  for (const k of new Set([...ka, ...kb])) {
    if (!(k in (a as object))) return { path: `${path}.${k}`, a: '(없음)', b: '(있음)' }
    if (!(k in (b as object))) return { path: `${path}.${k}`, a: '(있음)', b: '(없음)' }
    const d = firstDiff((a as any)[k], (b as any)[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`)
    if (d) return d
  }
  return null
}

const diff = firstDiff(actual, expected, '$')
const fmt = (n: number) => n.toLocaleString('ko-KR')
console.log(`입력: 원본 ${expected.input.rows_raw}행 / 주문 ${expected.input.orders}건 / 기간 ${expected.input.data_start} ~ ${expected.input.data_end}`)
console.log(`중복 제거 ${expected.dedupe.removed}행 + 복원 ${expected.dedupe.restored}행 / 남은 ${expected.rows_after_dedupe}행 / 미분류 ${expected.unclassified}행`)
if (expected.reconcile) console.log(`대조: ${expected.reconcile.matched}건 중 ${expected.reconcile.exact}건 일치`)
for (const s of expected.summaries) {
  if (s.status === 'ok') console.log(`  ${s.from}~${s.to} 받은 상품만: ${s.rows}행 ${fmt(s.total)}원`)
}
if (diff) {
  console.log(`FAIL: 첫 번째 불일치 경로 ${diff.path}`)
  console.log(`  TS    = ${JSON.stringify(diff.a)}`)
  console.log(`  oracle= ${JSON.stringify(diff.b)}`)
  process.exit(1)
}
console.log(`PASS: 기간 ${periods.length}개 x 상태 ${statuses.length}개 깊은 비교 불일치 0건`)
