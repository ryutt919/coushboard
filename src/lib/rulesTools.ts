import { compileRules } from './classify'
import { displayKeyword } from './normalize'
import type { EnrichedRow, RulesConfig } from './types'

export interface PreviewItem {
  base: string
  count: number
  current: string
  note: string
  kind: 'new' | 'same' | 'warn' | 'blocked'
  checked: boolean
}

/** 규칙을 추가하기 전에, 그 키워드에 걸리는 품목과 분류 변화를 미리 보여 준다 */
export function previewKeyword(rules: RulesConfig, rows: EnrichedRow[], keywordFragment: string, category: string): PreviewItem[] {
  let rx: RegExp
  try {
    rx = new RegExp(keywordFragment)
  } catch {
    return []
  }
  const next: RulesConfig = {
    ...rules,
    categories: rules.categories.map((c) => (c.name === category ? { ...c, keywords: [...c.keywords, keywordFragment] } : c)),
  }
  const before = compileRules(rules)
  const after = compileRules(next)
  const byBase = new Map<string, { name: string; count: number }>()
  for (const r of rows) {
    if (!rx.test(r.name)) continue
    const e = byBase.get(r.base)
    if (e) e.count += 1
    else byBase.set(r.base, { name: r.name, count: 1 })
  }
  const items: PreviewItem[] = []
  for (const [base, { name, count }] of byBase) {
    const cur = before.classify(name, base)
    const nxt = after.classify(name, base)
    let kind: PreviewItem['kind']
    let note: string
    if (nxt !== category) {
      kind = 'blocked'
      note = `위쪽 규칙(${nxt})이 먼저 적용됨`
    } else if (cur === category) {
      kind = 'same'
      note = `이미 ${category}`
    } else if (cur === rules.fallback) {
      kind = 'new'
      note = `${cur} → ${category}`
    } else {
      kind = 'warn'
      note = `${cur} → ${category}`
    }
    items.push({ base, count, current: cur, note, kind, checked: kind === 'new' || kind === 'same' })
  }
  items.sort((a, b) => b.count - a.count || (a.base < b.base ? -1 : 1))
  return items
}

export interface KeywordStat {
  category: string
  keyword: string
  label: string
  count: number
}

/** 키워드마다 걸리는 행 수 */
export function keywordStats(rules: RulesConfig, rows: EnrichedRow[]): KeywordStat[] {
  const clf = compileRules(rules)
  const counts = new Map<string, number>()
  for (const r of rows) {
    for (const m of clf.matches(r.name, r.base)) {
      const k = `${m.category}\u0000${m.keyword}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  }
  const out: KeywordStat[] = []
  for (const c of rules.categories) {
    for (const kw of c.keywords) {
      out.push({ category: c.name, keyword: kw, label: displayKeyword(kw), count: counts.get(`${c.name}\u0000${kw}`) ?? 0 })
    }
  }
  return out
}

export interface Conflict {
  category: string
  keyword: string
  label: string
  total: number
  /** 이 키워드가 없었다면 속했을 카테고리별 품목 수 */
  split: { category: string; n: number }[]
  products: { base: string; alt: string }[]
}

/**
 * 규칙 충돌: 한 키워드에 걸린 상품들이, 그 키워드가 없다면 서로 다른 카테고리에 속할 때.
 * 걸리는 상품이 2개 이상이고 대체 분류가 둘 이상으로 갈릴 때만 경고한다.
 */
export function findConflicts(rules: RulesConfig, rows: EnrichedRow[]): Conflict[] {
  const clf = compileRules(rules)
  const out: Conflict[] = []
  const byBase = new Map<string, EnrichedRow>()
  for (const r of rows) if (!byBase.has(r.base)) byBase.set(r.base, r)
  for (const c of rules.categories) {
    for (const kw of c.keywords) {
      const rx = new RegExp(kw)
      const hit: { base: string; alt: string }[] = []
      let total = 0
      for (const r of rows) if (rx.test(r.name)) total += 1
      for (const [base, r] of byBase) {
        if (!rx.test(r.name)) continue
        // 이 키워드가 이 카테고리의 첫 걸림일 때만 의미가 있다
        if (clf.classify(r.name, base) !== c.name) continue
        hit.push({ base, alt: clf.classifyWithout(r.name, base, c.name, kw) ?? c.name })
      }
      if (hit.length < 2) continue
      const split = new Map<string, number>()
      for (const h of hit) split.set(h.alt, (split.get(h.alt) ?? 0) + 1)
      if (split.size < 2) continue
      out.push({
        category: c.name,
        keyword: kw,
        label: displayKeyword(kw),
        total,
        split: [...split].map(([category, n]) => ({ category, n })).sort((a, b) => b.n - a.n),
        products: hit.filter((h) => h.alt !== c.name),
      })
    }
  }
  return out.sort((a, b) => b.total - a.total)
}

export function addKeyword(rules: RulesConfig, category: string, fragment: string): RulesConfig {
  return {
    ...rules,
    categories: rules.categories.map((c) => (c.name === category && !c.keywords.includes(fragment) ? { ...c, keywords: [...c.keywords, fragment] } : c)),
  }
}

export function removeKeyword(rules: RulesConfig, category: string, fragment: string): RulesConfig {
  return {
    ...rules,
    categories: rules.categories.map((c) => (c.name === category ? { ...c, keywords: c.keywords.filter((k) => k !== fragment) } : c)),
  }
}

export function addExclusions(rules: RulesConfig, keyword: string, bases: string[]): RulesConfig {
  const have = new Set((rules.exclusions ?? []).map((e) => `${e.keyword}\u0000${e.base}`))
  const add = bases.filter((b) => !have.has(`${keyword}\u0000${b}`)).map((base) => ({ keyword, base }))
  return { ...rules, exclusions: [...(rules.exclusions ?? []), ...add] }
}
