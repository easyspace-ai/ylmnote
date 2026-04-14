import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import MainLayout from '@/components/layout/MainLayout'
import HomePage from '@/pages/HomePage'
import SearchPage from '@/pages/SearchPage'
import ProjectList from '@/pages/ProjectList'
import ProjectDetail from '@/pages/ProjectDetail'
import SkillList from '@/pages/SkillList'
import Settings from '@/pages/Settings'
import NewProject from "@/pages/NewProject"
import Login from '@/pages/Auth/Login'
import Register from '@/pages/Auth/Register'
import { ToastProvider } from '@/components/ui/Feedback'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  if (!token || !user) {
    // Clear stale auth state (e.g. token exists but user info is missing)
    if (token || user) {
      logout()
    }
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function App() {
  return (
        <ToastProvider>
    <Router>
      <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <MainLayout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/boards" element={<ProjectList />} />
                <Route path="/boards/new" element={<NewProject />} />
                <Route path="/boards/:id/sessions/:sessionId" element={<ProjectDetail />} />
                <Route path="/boards/:id" element={<ProjectDetail />} />
                <Route path="/skills" element={<SkillList />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </MainLayout>
          </ProtectedRoute>
        } />
        
        {/* Catch all for nested routes inside MainLayout */}
        <Route path="/*" element={
          <ProtectedRoute>
            <MainLayout>
              <Routes>
                <Route path="/search" element={<SearchPage />} />
                <Route path="/boards" element={<ProjectList />} />
                <Route path="/boards/new" element={<NewProject />} />
                <Route path="/boards/:id/sessions/:sessionId" element={<ProjectDetail />} />
                <Route path="/boards/:id" element={<ProjectDetail />} />
                <Route path="/skills" element={<SkillList />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </MainLayout>
          </ProtectedRoute>
        } />
      </Routes>
      </ErrorBoundary>
    </Router>
    </ToastProvider>
  )
}

export default App
