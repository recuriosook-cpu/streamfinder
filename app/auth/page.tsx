'use client'

import { useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LogIn, UserPlus, Eye, EyeOff } from 'lucide-react'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
    </svg>
  )
}

export default function AuthPage() {
  const searchParams = useSearchParams()
  const mode_param = searchParams.get('mode')
  const [mode, setMode] = useState<'login' | 'register'>(mode_param === 'register' ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<'google'|'facebook'|null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = useRef(createClient()).current

  const handleGoogle = async () => {
    setSocialLoading('google')
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setSocialLoading(null) }
  }

  const handleFacebook = async () => {
    setSocialLoading('facebook')
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setSocialLoading(null) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('Email o contraseña incorrectos')
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, onboarding_completed')
          .eq('id', data.user.id)
          .maybeSingle()
        console.log('onboarding_completed:', profile?.onboarding_completed)
        if (profile?.onboarding_completed !== true) {
          router.replace('/onboarding')
        } else {
          router.replace(profile?.username ? `/usuario/${profile.username}` : '/')
        }
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setMessage('¡Registro exitoso! Revisá tu email para confirmar tu cuenta.')
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#13131A] rounded-2xl p-8 border border-[#2A2A3A]">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-1">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h1>
          <p className="text-[#A0A0B0] text-sm">
            {mode === 'login' ? 'Accedé a tus favoritos' : 'Empezá a guardar tus contenidos favoritos'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-[#1C1C27] rounded-lg p-1 mb-6">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${
              mode === 'login' ? 'bg-[#FFFD02] text-black' : 'text-[#A0A0B0] hover:text-white'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <LogIn size={14} /> Iniciar sesión
            </span>
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${
              mode === 'register' ? 'bg-[#FFFD02] text-black' : 'text-[#A0A0B0] hover:text-white'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <UserPlus size={14} /> Registrarse
            </span>
          </button>
        </div>

        {/* Social login buttons */}
        <div className="flex flex-col gap-3 mb-5">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={!!socialLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 disabled:opacity-60 text-zinc-900 font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {socialLoading === 'google'
              ? <span className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
              : <GoogleIcon />
            }
            Continuar con Google
          </button>
          <button
            type="button"
            onClick={handleFacebook}
            disabled={!!socialLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {socialLoading === 'facebook'
              ? <span className="w-4 h-4 border-2 border-blue-300 border-t-white rounded-full animate-spin" />
              : <FacebookIcon />
            }
            Continuar con Facebook
          </button>
        </div>

        {/* Separator */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-[#1C1C27]" />
          <span className="text-xs text-[#A0A0B0] font-medium">o</span>
          <div className="flex-1 h-px bg-[#1C1C27]" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-[#A0A0B0] block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="tu@email.com"
              className="w-full bg-[#1C1C27] border border-[#2A2A3A] rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#FFFD02] transition-colors"
            />
          </div>
          <div>
            <label className="text-sm text-[#A0A0B0] block mb-1.5">Contraseña</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-[#1C1C27] border border-[#2A2A3A] rounded-lg px-3 py-2.5 pr-10 text-white text-sm outline-none focus:border-[#FFFD02] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A0A0B0] hover:text-white"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-800 text-red-300 text-sm px-3 py-2.5 rounded-lg">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-[#FFFD02]/10 border border-[#F5A623] text-[#FFF84D] text-sm px-3 py-2.5 rounded-lg">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FFFD02] hover:bg-[#E5EB00] disabled:opacity-50 text-black font-medium py-2.5 rounded-lg transition-colors mt-2"
          >
            {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  )
}
