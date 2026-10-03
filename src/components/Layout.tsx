import type { ReactNode } from 'react'
import { OK_STATUSES } from '../lib/types'
import { useApp } from '../state/AppState'

export type Route = 'dashboard' | 'upload' | 'categories'

export function Layout({ route, children, actions }: { route: Route; children: ReactNode; actions?: ReactNode }) {
  const app = useApp()
  const unclassified = app.prep.kept.filter((r) => OK_STATUSES.has(r.status) && r.category === app.settings.rules.fallback).length
  const demo = app.mode === 'demo'
  return (
    <div className="shell">
      <header className="header">
        <div className="header-in">
          <a className="brand" href="#/" aria-label="대시보드로 이동">
            <div className="brand-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 10h18" />
                <path d="M7 15h4" />
              </svg>
            </div>
            <div>
              <div className="brand-name">
                쿠팡 지출 기록 {demo && <span className="badge demo" style={{ marginLeft: 6 }}>예시 화면</span>}
              </div>
              <div className="brand-sub" data-testid="header-sub">
                {app.hasData
                  ? `${demo ? '가짜 예시 데이터' : app.email ?? ''} · 주문 ${app.prep.orderCount}건 · 상품 ${app.prep.rawCount}행`
                  : demo
                    ? '가짜 예시 데이터'
                    : app.email ?? ''}
              </div>
            </div>
          </a>
          <nav aria-label="주 메뉴" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {actions}
            {route !== 'dashboard' && (
              <a className="btn" href="#/">
                대시보드
              </a>
            )}
            {route !== 'categories' && (
              <a className="btn" href="#/categories">
                카테고리 정리
                {unclassified > 0 && <span className="badge bad">미분류 {unclassified}</span>}
              </a>
            )}
            {route !== 'upload' && (
              <a className="btn primary" href="#/upload">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 16V4" />
                  <path d="M6 10l6-6 6 6" />
                  <path d="M4 20h16" />
                </svg>
                CSV 올리기
              </a>
            )}
            {demo ? (
              <button type="button" className="btn" onClick={app.leaveDemo}>
                예시 끝내기
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => void app.signOut()}>
                로그아웃
              </button>
            )}
          </nav>
        </div>
      </header>
      {demo && (
        <div style={{ background: 'var(--warn-bg)', borderBottom: '1px solid var(--warn-line)', color: 'var(--warn-ink)', fontSize: 14 }}>
          <div style={{ maxWidth: 1240, margin: '0 auto', padding: '10px 24px' }}>
            가짜(mock) 데이터로 만든 예시 화면입니다. 어디에도 저장되지 않고, 새로고침하면 처음으로 돌아갑니다.{' '}
            <button type="button" className="btn ghost" style={{ height: 'auto', padding: 0 }} onClick={app.leaveDemo}>
              가입하고 내 데이터 올리기
            </button>
          </div>
        </div>
      )}
      {children}
      {app.toast && (
        <div className={'toast' + (app.toast.err ? ' err' : '')} role="status">
          {app.toast.text}
        </div>
      )}
    </div>
  )
}
