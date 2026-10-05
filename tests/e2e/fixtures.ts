import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { StoredData } from '../../src/lib/stored'

/**
 * E2E_MODE=extension 이면 같은 화면 시나리오를 크롬 확장 대시보드(coupang-ledger-ext/app, npm run build:ext)에 돌린다.
 * 확장을 로드한 Chromium 하나를 워커 동안 공유하고, page.goto('/#/x') 를 chrome-extension://<id>/app/extension.html#/x 로 바꿔 준다.
 * 그 밖에는 Playwright 기본 test 그대로다.
 */
export const EXT = process.env.E2E_MODE === 'extension'
export const EXT_DIR = resolve(import.meta.dirname, '../../coupang-ledger-ext')

interface ExtWorker {
  extContext: BrowserContext
  extId: string
}

const extTest = base.extend<object, ExtWorker>({
  extContext: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'ext-e2e-')), {
        headless: false,
        args: ['--headless=new', `--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
      })
      await use(ctx)
      await ctx.close()
    },
    { scope: 'worker' },
  ],
  extId: [
    async ({ extContext }, use) => {
      const sw = extContext.serviceWorkers()[0] ?? (await extContext.waitForEvent('serviceworker', { timeout: 20000 }))
      const id = new URL(sw.url()).host
      process.env.E2E_EXT_ID = id
      await use(id)
    },
    { scope: 'worker' },
  ],
  context: async ({ extContext }, use) => {
    await use(extContext)
  },
  page: async ({ context, extId }, use) => {
    const page = await context.newPage()
    const goto = page.goto.bind(page)
    page.goto = ((url: string, opts?: Parameters<Page['goto']>[1]) =>
      goto(url.startsWith('/') ? `chrome-extension://${extId}/app/extension.html${url.slice(1)}` : url, opts)) as Page['goto']
    await use(page)
    await page.close()
  },
})

export const test = (EXT ? extTest : base) as typeof base

export async function swOf(page: Page) {
  const ctx = page.context()
  return ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 20000 }))
}

/** 확장 저장소를 비우고 예시(mock) 데이터를 넣는다. 웹앱의 "예시 화면 보기"와 같은 데이터다 */
export async function seedDemo(page: Page) {
  const d = JSON.parse(readFileSync(process.env.E2E_DEMO_JSON!, 'utf-8')) as StoredData // playwright.extension.config.ts 가 만든다
  const sw = await swOf(page)
  await sw.evaluate(async (s) => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set({
      orders: s.orders,
      receipts: s.receipts,
      imports: s.imports,
      settings: { rules: s.rules, overrides: s.overrides, merges: s.merges, dedupe: s.dedupe },
    })
  }, d)
}

/** 웹: "예시 화면 보기"를 누른다. 확장: 같은 예시 데이터를 저장소에 넣고 대시보드를 연다 */
export async function openDemo(page: Page) {
  if (!EXT) {
    await page.goto('/')
    await page.getByRole('button', { name: '예시 화면 보기' }).click()
    return
  }
  await seedDemo(page)
  await page.goto('/')
}
