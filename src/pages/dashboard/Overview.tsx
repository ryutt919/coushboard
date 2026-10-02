import { useMemo, useState } from 'react'
import { CatChip, SearchIcon, WarnIcon } from '../../components/Common'
import type { Coverage } from '../../lib/coverage'
import { yymm } from '../../lib/coverage'
import { dot } from '../../lib/dates'
import { csvEscape, downloadText, fmt, man } from '../../lib/format'
import { selectRows } from '../../lib/pipeline'
import type { EnrichedRow, Summary } from '../../lib/types'
import { useApp } from '../../state/AppState'
import type { Period } from '../Dashboard'
import { labeler } from './chart'
import { EditPanel } from './EditPanel'

const PAGE = 10

export function Overview({ period, sel, summary, cov }: { period: Period; sel: EnrichedRow[]; summary: Summary; cov: Coverage | null }) {
  const app = useApp()
  const { from, to, status } = period
  const fallback = app.settings.rules.fallback
  const [cat, setCat] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [edit, setEdit] = useState<EnrichedRow | null>(null)

  const inRange = useMemo(() => selectRows(app.prep.kept, from, to, 'all'), [app.prep.kept, from, to])
  const ret = inRange.filter((r) => r.status === '반품완료')
  const can = inRange.filter((r) => r.status === '취소완료')
  const sum = (l: EnrichedRow[]) => l.reduce((a, r) => a + r.amount, 0)

  let bannerStrong: string
  let bannerRest: string
  if (status === 'ok') {
    bannerStrong = `이 기간의 반품 ${ret.length}건·취소 ${can.length}건(${fmt(sum(ret) + sum(can))}원)은 집계에서 뺐습니다.`
    bannerRest = '금액은 주문목록의 가격 × 수량이라, 쿠폰·쿠팡캐시가 적용된 실제 카드 청구액과 일부 다를 수 있습니다.'
  } else if (status === 'all') {
    bannerStrong = `반품·취소 ${ret.length + can.length}건(${fmt(sum(ret) + sum(can))}원)이 합계에 들어 있습니다.`
    bannerRest = '실제로 받지 않은 상품까지 더한 값이라 지출보다 큽니다.'
  } else {
    bannerStrong = '반품·취소된 상품만 보고 있습니다.'
    bannerRest = '어떤 상품을 자주 돌려보냈는지 확인하는 용도입니다.'
  }
  if (cov?.sparse && from <= `${cov.sparse.to}-31`) {
    bannerRest += ` ${yymm(cov.sparse.to)} 이전은 주문 기록이 ${cov.sparse.rows}건뿐이라 드문드문합니다.`
  }

  const total = summary.total
  const top = sel.reduce<EnrichedRow | null>((m, r) => (!m || r.amount > m.amount ? r : m), null)
  const shownEnd = to > app.range.end ? app.range.end : to

  const cats = Object.entries(summary.by_category)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => Number(a.name === fallback) - Number(b.name === fallback) || b.amount - a.amount)
  const cmax = Math.max(1, ...cats.map((c) => c.amount))

  const lab = labeler(from, to)
  const keys = Object.keys(summary.buckets)
  const bmax = Math.max(1, ...keys.map((k) => summary.buckets[k].amount))
  const best = keys.filter((k) => summary.buckets[k].amount).sort((a, b) => summary.buckets[b].amount - summary.buckets[a].amount)[0]

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sel
      .filter((r) => !cat || r.category === cat)
      .filter((r) => !needle || r.name.toLowerCase().includes(needle))
      .sort((a, b) => (a.dt < b.dt ? 1 : a.dt > b.dt ? -1 : b.idx - a.idx))
  }, [sel, cat, q])

  function exportCsv() {
    const head = '거래일시,상품명,카테고리,판매가,수량,금액,상태'
    const lines = filtered.map((r) => [r.dt, r.name, r.category, r.price, r.qty, r.amount, r.status].map(csvEscape).join(','))
    downloadText('분류된_결제내역.csv', '﻿' + [head, ...lines].join('\r\n') + '\r\n', 'text/csv;charset=utf-8')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div role="note" className="notice" data-testid="banner">
        <WarnIcon />
        <div>
          <strong>{bannerStrong}</strong> {bannerRest}
        </div>
      </div>

      <section aria-label="요약" className="kpis">
        <div className="kpi">
          <div className="l">총 지출</div>
          <div className="v" data-testid="kpi-total">
            {fmt(total)}
            <small>원</small>
          </div>
          <div className="n">
            {dot(from)} – {dot(shownEnd)}
          </div>
        </div>
        <div className="kpi">
          <div className="l">주문 상품</div>
          <div className="v" data-testid="kpi-count">
            {fmt(sel.length)}
            <small>건</small>
          </div>
          <div className="n">{summary.order_days}일에 나눠 주문</div>
        </div>
        <div className="kpi">
          <div className="l">상품당 평균</div>
          <div className="v">
            {sel.length ? fmt(total / sel.length) : '0'}
            <small>원</small>
          </div>
          <div className="n">가격 × 수량 기준</div>
        </div>
        <div className="kpi">
          <div className="l">가장 큰 구매</div>
          <div className="v">
            {top ? fmt(top.amount) : '0'}
            <small>원</small>
          </div>
          <div className="n">{top ? top.base + (top.qty > 1 ? ` × ${top.qty}` : '') : '—'}</div>
        </div>
      </section>

      <section className="grid2">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="h2">카테고리별 지출</h2>
            <span className="sub">항목을 누르면 아래 표가 걸러집니다</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 16 }}>
            {cats.length === 0 && <div className="sub">이 기간에는 주문이 없습니다.</div>}
            {cats.map((c) => {
              const on = cat === c.name
              return (
                <button
                  key={c.name}
                  type="button"
                  className={'catrow' + (on ? ' on' : '') + (cat && !on ? ' dim' : '')}
                  aria-pressed={on}
                  data-testid={`cat-${c.name}`}
                  onClick={() => {
                    setCat(on ? null : c.name)
                    setShown(PAGE)
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {c.name} <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 13 }}>{c.n}건</span>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {fmt(c.amount)}원{' '}
                      <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 13, display: 'inline-block', width: 44, textAlign: 'right' }}>
                        {total ? ((c.amount / total) * 100).toFixed(1) : '0.0'}%
                      </span>
                    </span>
                  </div>
                  <div className="meter">
                    <div style={{ width: `${Math.max(1.5, (c.amount / cmax) * 100).toFixed(1)}%`, background: c.name === fallback ? '#6b7180' : undefined }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="h2">{lab.yearly ? '연도별' : '월별'} 지출</h2>
            <span className="sub">
              {dot(from).slice(0, 7)} – {dot(to).slice(0, 7)}
            </span>
          </div>
          <div className="bars" role="img" aria-label={`${lab.yearly ? '연도별' : '월별'} 지출 막대 그래프`} data-testid="bars">
            {keys.map((k) => {
              const b = summary.buckets[k]
              return (
                <div className="bar-col" key={k}>
                  <span className="bar-val" style={{ color: b.future ? '#6b7180' : 'var(--ink)' }}>
                    {b.future ? '—' : b.amount ? man(b.amount) : ''}
                  </span>
                  <div className="bar" data-testid="bar" data-future={b.future} style={{ height: b.future || !b.amount ? 0 : Math.max(3, Math.round((b.amount / bmax) * 200)) }} />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }} aria-hidden="true">
            {keys.map((k) => (
              <span className="bar-label" key={k}>
                {lab.label(k)}
              </span>
            ))}
          </div>
          <div className="sub" style={{ marginTop: 12 }}>
            {best ? `가장 많이 쓴 ${lab.yearly ? '해' : '달'}: ${lab.label(best)} ${fmt(summary.buckets[best].amount)}원 (${summary.buckets[best].n}건)` : '이 기간에는 주문이 없습니다.'}
            {to > app.range.end && ` · 데이터는 ${dot(app.range.end)}까지입니다`}
          </div>
        </div>
      </section>

      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="h2">결제 내역</h2>
            {cat && (
              <button type="button" onClick={() => setCat(null)} style={{ height: 32, padding: '0 10px', border: '1px solid var(--accent-line)', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 16, fontSize: 13, fontWeight: 600 }}>
                {cat} ✕
              </button>
            )}
          </div>
          <label className="search" style={{ width: 260, maxWidth: '100%' }}>
            <SearchIcon />
            <input type="search" placeholder="상품명 검색" aria-label="상품명 검색" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE) }} />
          </label>
        </div>
        {edit && <EditPanel key={edit.key} row={edit} onClose={() => setEdit(null)} />}
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 760 }} data-testid="rows">
            <thead>
              <tr>
                <th scope="col">거래일시</th>
                <th scope="col">상품</th>
                <th scope="col">카테고리</th>
                <th scope="col">가격 × 수량</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  금액
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, shown).map((r) => (
                <tr key={r.key + (r.restored ? 'r' : '')} data-testid="row">
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{dot(r.date)}</td>
                  <td style={{ maxWidth: 380 }}>
                    <div className="ellipsis">{r.name}</div>
                    {(r.status === '반품완료' || r.status === '취소완료' || r.restored) && (
                      <div className="sub" style={{ fontSize: 12, marginTop: 2 }}>
                        {r.status === '반품완료' || r.status === '취소완료' ? r.status : ''}
                        {r.restored ? ' 영수증으로 되살린 행' : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    <button type="button" aria-label={`카테고리 변경: ${r.category}`} onClick={() => setEdit(r)} style={{ border: 0, background: 'transparent', padding: 0 }}>
                      <CatChip category={r.category}>
                        {r.category}
                        {r.manual && <span title="직접 지정">✎</span>}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </CatChip>
                    </button>
                  </td>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {fmt(r.price)}원 × {r.qty}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(r.amount)}원</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="sub" style={{ textAlign: 'center', padding: 28 }}>
                    조건에 맞는 결제 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} className="sub">
          <span data-testid="count-label">
            {sel.length}건 중 {filtered.length}건 · 최근 순 {Math.min(shown, filtered.length)}건 표시
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {filtered.length > shown && (
              <button type="button" className="btn sm" onClick={() => setShown(shown + 20)}>
                더 보기
              </button>
            )}
            <button type="button" className="btn sm" onClick={exportCsv}>
              수정한 카테고리 CSV로 내려받기
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
