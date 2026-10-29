import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import GlobalFilingBadge from '@/components/GlobalFilingBadge'
import LoginPage from '@/pages/LoginPage'
import GuestExamPage from '@/pages/GuestExamPage'
import { usesHashRouter } from '@/utils/navigation'

const Router = usesHashRouter() ? HashRouter : BrowserRouter

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Router>
        <AuthProvider>
          <div className="relative min-h-screen">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/exam"
                element={
                  <ProtectedRoute>
                    <GuestExamPage recruitmentYear={2027} recruitmentSeason="秋季" />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/exam" replace />} />
            </Routes>
            <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10">
              <GlobalFilingBadge />
            </div>
          </div>
        </AuthProvider>
      </Router>
    </ConfigProvider>
  )
}
