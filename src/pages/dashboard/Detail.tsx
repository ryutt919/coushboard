import { useMemo, useState } from 'react'
import { Modal, SearchIcon } from '../../components/Common'
import { daysBetween, dot, planBuckets } from '../../lib/dates'
import { fmt } from '../../lib/format'
import type { EnrichedRow, Summary } from '../../lib/types'
import { useApp } from '../../state/AppState'
import type { Period } from '../Dashboard'
import { labeler } from './chart'

type Sort = 'count' | 'amount'

export function Detail({ period, sel, summary }: { period: Period; sel: EnrichedRow[]; summary: Summary }) {
  const app = useApp()
  const { from, to } = period
  const [sort, setSort] = useState<Sort>('count')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)

  const products = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = summary.products.filter((p) => !needle || p.group.toLowerCase().includes(needle) || p.aliases.some((a) => a.toLowerCase().includes(needle)))
    return [...list].sort((a, b) => (sort === 'count' ? b.n - a.n || b.amount - a.amount : b.amount - a.amount || b.n - a.n))
  }, [summary.products, sort, q])

  if (summary.products.length === 0) {
    return (
      <div className="card" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
        이 기간에 2번 이상 산 품목이 없습니다. 기간을 넓혀 보세요.
      </div>
    )
  }

  const cur = products.find((p) => p.group === picked) ?? products[0]
  const lines = cur
    ? sel
        .filter((r) => r.group === cur.group)
        .sort((a, b) => (a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : a.idx - b.idx))
    : []
  const days = [...new Set(lines.map((l) => l.date))].sort()
  const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d))
  const plan = planBuckets(from, to)
  const lab = labeler(from, to)
  const pb: Record<string, { a: number; n: number }> = {}
  for (const k of plan.keys) pb[k] = { a: 0, n: 0 }
  for (const l of lines) {
    const k = plan.keyOf(l.date)
    if (pb[k]) {
      pb[k].a += l.amount
      pb[k].n += 1
    }
  }
  const pmax = Math.max(1, ...plan.keys.map((k) => pb[k].a))
  const minUnit = cur ? cur.min_unit_price : 0
  const category = lines.length ? lines[lines.length - 1].category : ''
  const futureKeys = plan.keys.filter((k) => plan.isFuture(k, app.range.end))

  return (
    <>
      <div className="split">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 16px 12px' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>자주 산 품목</h2>
            <div className="sub" style={{ marginTop: 2 }}>
              선택한 기간에 2번 이상 산 품목 · {summary.products.length}개
            </div>
            <div className="seg" style={{ marginTop: 12 }} role="group" aria-label="정렬">
              {([['count', '구매 횟수순'], ['amount', '지출 금액순']] as const).map(([k, label]) => (
                <button key={k} type="button" className={sort === k ? 'on' : ''} aria-pressed={sort === k} onClick={() => setSort(k)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="search" style={{ marginTop: 10 }}>
              <SearchIcon />
              <input type="search" placeholder="품목 검색 (예: 펩시)" aria-label="품목 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          <div style={{ borderTop: '1px solid var(--line-2)', maxHeight: 640, overflowY: 'auto' }} data-testid="product-list">
            {products.length === 0 && (
              <div className="sub" style={{ padding: 20 }}>
                검색 결과가 없습니다.
              </div>
            )}
            {products.map((p) => (
              <button key={p.group} type="button" className={'listbtn' + (cur && cur.group === p.group ? ' on' : '')} aria-pressed={cur && cur.group === p.group} onClick={() => setPicked(p.group)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <span className="ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>
                    {p.group}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(p.amount)}원</span>
                </div>
                <div className="sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 3, fontSize: 12 }}>
                  <span>
                    {p.n}건 · 마지막 {dot(p.last).slice(2)}
                  </span>
                  <span>개당 {fmt(p.min_unit_price)}원~</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {cur && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} data-testid="product-detail">
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div className="sub" style={{ fontSize: 12 }}>
                    {category}
                  </div>
                  <h2 style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }} data-testid="product-name">
                    {cur.group}
                  </h2>
                </div>
                <button type="button" className="btn sm" onClick={() => setMergeOpen(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 3H5a2 2 0 00-2 2v3" />
                    <path d="M16 3h3a2 2 0 012 2v3" />
                    <path d="M12 8v8" />
                    <path d="M8 12h8" />
                  </svg>
                  다른 이름 합치기
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                <span className="sub" style={{ fontSize: 12 }}>
                  주문목록상 이름
                </span>
                {cur.aliases.map((a) => (
                  <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 10px', borderRadius: 14, background: '#f1f2f4', fontSize: 12, color: 'var(--ink-2)' }} data-testid="alias">
                    {a}
                    {app.stored.merges[a] && (
                      <button
                        type="button"
                        aria-label={`${a} 합치기 해제`}
                        onClick={() => void app.setMerge(a, null).then(() => app.notify('합치기를 해제했습니다')).catch(() => undefined)}
                        style={{ width: 18, height: 18, border: 0, borderRadius: 9, background: '#e1e3e8', color: 'var(--muted)', fontSize: 11, padding: 0 }}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}
              </div>

              <div className="stat4" style={{ marginTop: 18 }}>
                <div>
                  <div className="l">기간 내 지출</div>
                  <div className="v" data-testid="prod-amount">
                    {fmt(cur.amount)}
                    <small>원</small>
                  </div>
                  <div className="n" data-testid="prod-unit-range">
                    개당 {fmt(cur.min_unit_price)}원 ~ {fmt(cur.max_unit_price)}원
                  </div>
                </div>
                <div>
                  <div className="l">구매</div>
                  <div className="v" data-testid="prod-count">
                    {cur.n}
                    <small>건</small>
                  </div>
                  <div className="n">주문일 {cur.order_days}일</div>
                </div>
                <div>
                  <div className="l">평균 구매 간격</div>
                  <div className="v">
                    {gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : '—'}
                    <small>일</small>
                  </div>
                  <div className="n">{gaps.length ? `최소 ${Math.min(...gaps)}일 · 최대 ${Math.max(...gaps)}일` : '주문일 하루'}</div>
                </div>
                <div>
                  <div className="l">마지막 구매</div>
                  <div className="v">{dot(cur.last).slice(2)}</div>
                  <div className="n">{daysBetween(cur.last, app.range.end)}일 전</div>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700 }}>{lab.yearly ? '연도별' : '월별'} 구매</h3>
                  <span className="sub" style={{ fontSize: 12 }}>
                    막대 위 = 지출(원) · 아래 = 구매 건수
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${plan.keys.length}, minmax(0, 1fr))`, gap: 6, alignItems: 'end', height: 180, marginTop: 12, borderBottom: '1px solid #c9cdd5' }} role="img" aria-label="품목 구매 막대 그래프">
                  {plan.keys.map((k) => {
                    const fut = plan.isFuture(k, app.range.end)
                    return (
                      <div key={k} style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4, minWidth: 0 }}>
                        <span className="bar-val" style={{ color: fut ? '#6b7180' : 'var(--ink)' }}>
                          {fut ? '—' : pb[k].a ? fmt(pb[k].a) : ''}
                        </span>
                        <div className="bar" style={{ maxWidth: 40, height: fut || !pb[k].a ? 0 : Math.max(4, Math.round((pb[k].a / pmax) * 140)) }} />
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${plan.keys.length}, minmax(0, 1fr))`, gap: 6, marginTop: 6 }} aria-hidden="true">
                  {plan.keys.map((k) => (
                    <div key={k} style={{ textAlign: 'center', minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}>{lab.label(k)}</div>
                      <div className="sub" style={{ fontSize: 11, marginTop: 1 }}>
                        {plan.isFuture(k, app.range.end) ? '' : `${pb[k].n}건`}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="sub" style={{ fontSize: 12, marginTop: 10 }}>
                  {to > app.range.end && `데이터는 ${dot(app.range.end)}까지입니다${futureKeys.length ? ` · ${futureKeys.map(lab.label).join('·')}은 아직 없음` : ''}. `}
                  {lab.yearly && '18개월이 넘는 기간은 연도별로 묶어 보여 줍니다.'}
                </div>
              </div>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="card-head" style={{ alignItems: 'baseline' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>구매 이력</h3>
                <span className="sub">최근 순</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl" style={{ minWidth: 640 }} data-testid="history">
                  <thead>
                    <tr>
                      <th scope="col">거래일시</th>
                      <th scope="col">주문목록 상품명 · 옵션</th>
                      <th scope="col">개당 가격</th>
                      <th scope="col">수량</th>
                      <th scope="col" style={{ textAlign: 'right' }}>
                        금액
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...lines].reverse().map((l) => {
                      const best = Math.round(l.unit_price * 100) / 100 === minUnit || Math.abs(l.unit_price - minUnit) < 0.005
                      return (
                        <tr key={l.key + (l.restored ? 'r' : '')}>
                          <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{dot(l.date)}</td>
                          <td style={{ maxWidth: 320 }}>
                            <div className="ellipsis">{l.base}</div>
                            <div className="sub" style={{ fontSize: 12, marginTop: 2 }}>
                              {l.opt}
                              {l.status === '반품완료' || l.status === '취소완료' ? ` · ${l.status}` : ''}
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span
                              data-testid={best ? 'unit-best' : 'unit'}
                              style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', background: best ? 'var(--good-soft)' : '#f1f2f4', color: best ? 'var(--good)' : 'var(--ink-2)' }}
                            >
                              {fmt(l.unit_price)}원
                            </span>
                          </td>
                          <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{l.qty}개</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{fmt(l.amount)}원</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="sub" style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', background: 'var(--surface-2)', lineHeight: 1.55 }}>
                개당 가격은 옵션의 'N개'로 나눈 값입니다. 가장 싸게 산 주문은 초록색으로 표시합니다. 같은 날 같은 상품이 여러 줄이면 각각 따로 산 것으로 셉니다.
              </div>
            </div>
          </div>
        )}
      </div>
      {mergeOpen && cur && <MergeDialog group={cur.group} onClose={() => setMergeOpen(false)} />}
    </>
  )
}

function MergeDialog({ group, onClose }: { group: string; onClose: () => void }) {
  const app = useApp()
  const [q, setQ] = useState('')
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => {
    const m = new Map<string, { bases: Set<string>; n: number }>()
    for (const r of app.prep.kept) {
      if (r.group === group) continue
      const e = m.get(r.group) ?? { bases: new Set<string>(), n: 0 }
      e.bases.add(r.base)
      e.n += 1
      m.set(r.group, e)
    }
    const needle = q.trim().toLowerCase()
    return [...m.entries()]
      .filter(([g]) => !needle || g.toLowerCase().includes(needle))
      .sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1))
      .slice(0, 50)
  }, [app.prep.kept, group, q])

  async function save() {
    setBusy(true)
    try {
      const all = new Map(groups)
      for (const g of chosen) {
        for (const base of all.get(g)?.bases ?? []) await app.setMerge(base, group)
      }
      app.notify(`${chosen.size}개 품목을 '${group}'에 합쳤습니다`)
      onClose()
    } catch {
      /* 알림은 이미 표시됨 */
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`다른 이름 합치기 · ${group}`} onClose={onClose}>
      <p className="sub" style={{ marginTop: 0, lineHeight: 1.6 }}>
        주문목록에서 이름이 다르지만 같은 상품인 것을 골라 이 품목으로 합칩니다. 합친 결과는 이후 업로드에도 적용됩니다.
      </p>
      <label className="search">
        <SearchIcon />
        <input type="search" aria-label="합칠 품목 검색" placeholder="이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div style={{ marginTop: 10, border: '1px solid var(--line-2)', borderRadius: 10, maxHeight: 320, overflowY: 'auto' }}>
        {groups.map(([g, v]) => (
          <label key={g} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--line-2)', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={chosen.has(g)}
              onChange={(e) => {
                const n = new Set(chosen)
                if (e.target.checked) n.add(g)
                else n.delete(g)
                setChosen(n)
              }}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)', flexShrink: 0 }}
            />
            <span className="ellipsis" style={{ flexGrow: 1 }}>
              {g}
            </span>
            <span className="sub">{v.n}건</span>
          </label>
        ))}
        {groups.length === 0 && <div className="sub" style={{ padding: 16 }}>찾는 품목이 없습니다.</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button type="button" className="btn sm" onClick={onClose}>
          취소
        </button>
        <button type="button" className="btn sm primary" disabled={busy || chosen.size === 0} onClick={() => void save()}>
          {chosen.size}개 합치기
        </button>
      </div>
    </Modal>
  )
}
