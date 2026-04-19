import { useEffect, useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { Eye, EyeOff, ArrowRight, Github, Mail } from 'lucide-react'
import { cn } from '@/utils'
import { API_CONFIG } from '@/config/api'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { setToken, setUser } = useAuthStore()

  useEffect(() => {
    const qs = new URLSearchParams(location.search)
    const reason = qs.get('reason')
    if (reason === 'expired') {
      setError('登录已过期，请重新登录')
    }
  }, [location.search])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setError('')
      setIsLoading(true)
      const { access_token } = await authApi.login({ username, password })
      setToken(access_token)
            const userRes = await fetch(`${API_CONFIG.baseUrl}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${access_token}` }
      })
      const user = await userRes.json()

      setUser(user)
      const qs = new URLSearchParams(location.search)
      const redirect = qs.get('redirect')
      navigate(redirect && redirect.startsWith('/') ? redirect : '/')
    } catch (err: any) {
      setError(err.message || '登录失败，请检查用户名和密码')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* 左侧装饰区 */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-purple-800" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZ2LTRoLTJ2NGgyem0tNiA2aC00djJoNHYtMnptMC02di00aC00djRoNHptLTYgNmgtNHYyaDR2LTJ6bTAtNnYtNGgtNHY0aDR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        
        {/* 装饰元素 */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <img
            src="/logo.jpg"
            alt="MetaNote"
            className="w-16 h-16 mb-8 rounded-2xl object-cover shadow-lg ring-1 ring-white/25"
          />
          <h1 className="text-4xl font-bold mb-6 leading-tight">
            释放你的<br />
            <span className="text-primary-200">创造力</span>
          </h1>
          <p className="text-lg text-white/80 leading-relaxed max-w-md">
            MetaNote 是你的智能助手，帮助你更高效地完成写作、研究、编程等各种任务。
          </p>
          
          {/* 功能点 */}
          <div className="mt-12 space-y-4">
            {[
              '智能写作与内容创作',
              '深度研究与数据分析',
              '代码审查与优化建议',
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/90">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* 右侧登录表单 */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 bg-gray-25">
        <div className="w-full max-w-md mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <img
              src="/logo.jpg"
              alt="MetaNote"
              className="w-10 h-10 rounded-xl object-cover shadow-lg shadow-primary-500/25"
            />
            <span className="text-xl font-bold text-gray-900">MetaNote</span>
          </div>
          
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">欢迎回来</h2>
            <p className="text-gray-500">登录你的账户开始使用</p>
          </div>
          
          {/* 社交登录 */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all">
              <Github size={18} />
              <span className="text-sm font-medium text-gray-700">GitHub</span>
            </button>
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all">
              <Mail size={18} />
              <span className="text-sm font-medium text-gray-700">Google</span>
            </button>
          </div>
          
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-gray-25 text-gray-400">或使用邮箱登录</span>
            </div>
          </div>
          
          <form className="space-y-5" onSubmit={handleLogin}>
            {error && (
              <div className="p-4 bg-danger-50 border border-danger-100 rounded-xl text-sm text-danger-600">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">用户名</label>
              <input
                type="text"
                required
                className="input-base"
                placeholder="输入你的用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="input-base pr-10"
                  placeholder="输入你的密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-600">记住我</span>
              </label>
              <Link to="/forgot-password" className="text-sm font-medium text-primary-600 hover:text-primary-700">
                忘记密码？
              </Link>
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white font-medium transition-all duration-200",
                isLoading 
                  ? "bg-gray-400 cursor-not-allowed" 
                  : "bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5"
              )}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  登录
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              还没有账号？{' '}
              <Link to="/register" className="font-medium text-primary-600 hover:text-primary-700">
                立即注册
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
