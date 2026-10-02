import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import rules from '../src/data/category-rules.json'
import merges from '../src/data/product-merges.json'
import type { RulesConfig } from '../src/lib/types'

export const ROOT = resolve(import.meta.dirname, '..')
export const RULES = rules as RulesConfig
export const MERGES = merges as Record<string, string>
export const fx = (name: string) => readFileSync(resolve(ROOT, 'tests/fixtures', name), 'utf-8')
export const PERIODS = ['ALL', '2025-01-01:2026-06-30']
export const STATUSES3 = ['ok', 'all', 'ret'] as const
