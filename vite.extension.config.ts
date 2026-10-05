import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 크롬 확장 대시보드와 팝업 빌드. 웹앱(src/)을 그대로 쓰되 저장소만 chrome.storage.local 로 바꾼다.
// 결과는 coupang-ledger-ext/app/ 에 만들어지고, 확장은 이 폴더를 압축해제 로드한다. 실행: npm run build:ext
export default defineConfig({
  plugins: [react()],
  base: './',
  define: { 'import.meta.env.VITE_TARGET': JSON.stringify('extension') },
  resolve: {
    alias: [{ find: /^\.\.\/lib\/supabase$/, replacement: resolve(import.meta.dirname, 'src/extension/supabaseStub.ts') }],
  },
  build: {
    outDir: 'coupang-ledger-ext/app',
    emptyOutDir: true,
    assetsInlineLimit: 0, // 확장 CSP(script-src 'self')와 폰트 로딩을 웹앱과 같게 유지
    rollupOptions: { input: { extension: resolve(import.meta.dirname, 'extension.html'), popup: resolve(import.meta.dirname, 'popup.html') } },
  },
})
