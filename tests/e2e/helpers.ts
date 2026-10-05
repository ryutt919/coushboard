import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'

export const FIX = (n: string) => resolve(import.meta.dirname, '../fixtures', n)

/** 모든 네트워크 요청의 호스트를 모은다(자기 도메인과 Supabase만 허용해야 한다) */
export function trackHosts(page: Page): { hosts: Set<string>; urls: string[] } {
  const hosts = new Set<string>()
  const urls: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.protocol === 'data:' || u.protocol === 'blob:') return
    hosts.add(u.host)
    urls.push(r.url())
  })
  return { hosts, urls }
}

export function allowedHost(h: string, base: string): boolean {
  // 확장 모드(E2E_MODE=extension): 확장 자기 자신(chrome-extension://<id>) 외에는 어디에도 요청하지 않아야 한다
  if (process.env.E2E_EXT_ID) return h === process.env.E2E_EXT_ID
  return h === new URL(base).host || /\.supabase\.co$/.test(h)
}

export async function expectNoSeriousA11y(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const detail = bad.map((v) => `${label}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
  expect(detail).toEqual([])
}
