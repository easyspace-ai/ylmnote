import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authApi } from '@/services/api'
import { Eye, EyeOff, ArrowRight, Github, Mail, Check, X } from 'lucide-react'
import { cn } from '@/utils'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!username || username.length < 3) {
      setError('用户名至少需要3个字符');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (!password || password.length < 6) {
      setError('密码至少需要6个字符');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    
    try {
      setError('')
      setIsLoading(true)
      await authApi.register({ username, email, password })
      navigate('/login')
    } catch (err: any) {
      setError(err.message || '注册失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }
  
  // 密码强度检查
  const getPasswordStrength = (pwd: string) => {
    let score = 0
    if (pwd.length >= 8) score++
    if (/[A-Z]/.test(pwd)) score++
    if (/[0-9]/.test(pwd)) score++
    if (/[^A-Za-z0-9]/.test(pwd)) score++
    return score
  }
  
  const passwordStrength = getPasswordStrength(password)
  const strengthLabels = ['太弱', '较弱', '一般', '良好', '强']
  const strengthColors = ['bg-danger-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-emerald-600']

  return (
    <div className="min-h-screen flex">
      {/* 左侧装饰区 */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-primary-700 to-primary-800" />
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
            开启你的<br />
            <span className="text-primary-200">AI 之旅</span>
          </h1>
          <p className="text-lg text-white/80 leading-relaxed max-w-md">
            注册 MetaNote，体验智能助手带来的高效工作方式。
          </p>
          
          {/* 统计数据 */}
          <div className="mt-12 grid grid-cols-2 gap-8">
            <div>
              <div className="text-3xl font-bold">10万+</div>
              <div className="text-white/70">活跃用户</div>
            </div>
            <div>
              <div className="text-3xl font-bold">500万+</div>
              <div className="text-white/70">AI 对话</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 右侧注册表单 */}
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
            <h2 className="text-3xl font-bold text-gray-900 mb-2">创建账户</h2>
            <p className="text-gray-500">填写以下信息开始你的 AI 之旅</p>
          </div>
          
          {/* 社交注册 */}
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
              <span className="px-4 bg-gray-25 text-gray-400">或使用邮箱注册</span>
            </div>
          </div>
          
          <form className="space-y-5" onSubmit={handleRegister}>
            {error && (
              <div className="p-4 bg-danger-50 border border-danger-100 rounded-xl text-sm text-danger-600 flex items-start gap-2">
                <X size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">用户名</label>
              <input
                type="text"
                required
                className="input-base"
                placeholder="设置一个用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">邮箱</label>
              <input
                type="email"
                required
                className="input-base"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">密码</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="input-base pr-10"
                  placeholder="设置登录密码"
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
              
              {/* 密码强度指示器 */}
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1.5 flex-1 rounded-full transition-colors",
                          i < passwordStrength ? strengthColors[passwordStrength - 1] : "bg-gray-200"
                        )}
                      />
                    ))}
                  </div>
                  <p className={cn(
                    "text-xs",
                    passwordStrength < 2 ? "text-danger-500" : "text-emerald-600"
                  )}>
                    密码强度: {strengthLabels[passwordStrength]}
                  </p>
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">确认密码</label>
              <input
                type="password"
                required
                className="input-base"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-xs text-danger-500">两次输入的密码不一致</p>
              )}
            </div>
            
            <div className="flex items-start gap-2">
              <input type="checkbox" required className="w-4 h-4 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-gray-600">
                我已阅读并同意{' '}
                <Link to="/terms" className="text-primary-600 hover:text-primary-700">服务条款</Link>
                {' '}和{' '}
                <Link to="/privacy" className="text-primary-600 hover:text-primary-700">隐私政策</Link>
              </span>
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
                  创建账户
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              已有账号？{' '}
              <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
                直接登录
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
