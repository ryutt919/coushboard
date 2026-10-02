import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runPipeline } from '../src/lib/pipeline'
import { fx, MERGES, PERIODS, ROOT, RULES, STATUSES3 } from './helpers'

export function runOracle(args: string[]): unknown {
  for (const py of ['python3', 'python']) {
    const r = spawnSync(py, [resolve(ROOT, 'tools/oracle/oracle.py'), ...args], { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    if (r.status === 0 && r.stdout) return JSON.parse(r.stdout)
  }
  throw new Error('oracle.py 실행 실패 (python3/python 모두)')
}

describe('차등: oracle.py 실행 결과 vs runPipeline (픽스처)', () => {
  const base = [
    '--orders', resolve(ROOT, 'tests/fixtures/orders_fixture.csv'),
    '--rules', resolve(ROOT, 'src/data/category-rules.json'),
    '--merges', resolve(ROOT, 'src/data/product-merges.json'),
    ...PERIODS.flatMap((p) => ['--period', p]),
    ...STATUSES3.flatMap((s) => ['--status', s]),
  ]
  it.each([true, false])('영수증 %s', (withReceipts) => {
    const args = withReceipts ? [...base, '--receipts', resolve(ROOT, 'tests/fixtures/receipts_fixture.csv')] : base
    const expected = runOracle(args)
    const actual = runPipeline({
      ordersCsv: fx('orders_fixture.csv'),
      receiptsCsv: withReceipts ? fx('receipts_fixture.csv') : null,
      rules: RULES,
      merges: MERGES,
      periods: PERIODS,
      statuses: [...STATUSES3],
    })
    expect(actual).toEqual(expected)
  })
})
