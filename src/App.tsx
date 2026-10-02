import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './state/AppState'
import { Categories } from './pages/Categories'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { Upload } from './pages/Upload'

function useHashRoute(): string {
  const get = () => (window.location.hash.replace(/^#/, '').split('?')[0] || '/')
  const [route, setRoute] = useState(get)
  useEffect(() => {
    const on = () => setRoute(get())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

function Routes() {
  const app = useApp()
  const route = useHashRoute()
  if (app.mode === 'loading') {
    return (
      <div className="shell" role="status" style={{ padding: 40 }}>
        불러오는 중…
      </div>
    )
  }
  // 로그아웃 상태에서는 어떤 주소로 들어와도 로그인 화면만 보이고, 데이터 요청은 보내지 않는다.
  if (app.mode === 'out') return <Login />
  if (route === '/upload') return <Upload />
  if (route === '/categories') return <Categories />
  return <Dashboard />
}

export function App() {
  return (
    <AppProvider>
      <Routes />
    </AppProvider>
  )
}
