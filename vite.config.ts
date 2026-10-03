import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // CSP(font-src 'self')를 지키기 위해 작은 폰트 파일을 data: URI로 인라인하지 않는다
  build: { assetsInlineLimit: 0 },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    testTimeout: 60000,
  },
})
