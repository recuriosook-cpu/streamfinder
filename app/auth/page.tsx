'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { track } from '@/lib/analytics'

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
  const [socialLoading, setSocialLoading] = useState<'google' | 'facebook' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = useRef(createClient()).current

  // signup_started: se dispara cuando queda visible el formulario de registro,
  // sea porque se llegó con ?mode=register o porque se tocó el tab. El `metodo`
  // es 'email' porque eso es lo que muestra el formulario; si después elige
  // Google o Facebook, esos botones mandan su propio signup_started.
  useEffect(() => {
    if (mode === 'register') track('signup_started', { metodo: 'email' })
  }, [mode])

  const handleGoogle = async () => {
    setSocialLoading('google')
    setError('')
    track('signup_started', { metodo: 'google' })
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setSocialLoading(null) }
  }

  const handleFacebook = async () => {
    setSocialLoading('facebook')
    setError('')
    track('signup_started', { metodo: 'facebook' })
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
          .select('username, onboarding_completed, onboarding_skipped')
          .eq('id', data.user.id)
          .maybeSingle()
        if (profile?.onboarding_completed !== true && profile?.onboarding_skipped !== true) {
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

  const inputClass =
    'w-full bg-[#0A0A0F] border border-[#2A2A3A] rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors placeholder-[#A0A0B0] hover:border-zinc-600 focus:border-[#FFFD02]'

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center px-4 py-12 relative overflow-hidden">

      {/* Atmospheric glow */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-[0.045]"
          style={{ background: 'radial-gradient(circle, #FFFD02 0%, transparent 65%)' }}
        />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-[440px] bg-[#13131A] rounded-[20px] p-10 border border-[#2A2A3A] shadow-2xl">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Glynbox" style={{ height: '36px', width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Heading */}
        <div className="text-center mb-7">
          <h1 className="text-2xl font-bold text-white mb-1.5">
            {mode === 'login' ? 'Bienvenido de vuelta' : 'Creá tu cuenta gratis'}
          </h1>
          <p className="text-[#A0A0B0] text-sm">
            {mode === 'login' ? 'Ingresá tus datos para continuar' : 'Empezá a descubrir y compartir'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#0A0A0F] rounded-xl p-1 mb-7 border border-[#2A2A3A]">
          <button
            onClick={() => { setMode('login'); setError(''); setMessage('') }}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors ${
              mode === 'login' ? 'bg-[#FFFD02] text-black' : 'text-[#A0A0B0] hover:text-white'
            }`}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); setMessage('') }}
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors ${
              mode === 'register' ? 'bg-[#FFFD02] text-black' : 'text-[#A0A0B0] hover:text-white'
            }`}
          >
            Crear cuenta
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mb-5">
          <div>
            <label className="text-white text-xs font-medium block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="tu@email.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-white text-xs font-medium block mb-1.5">Contraseña</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#A0A0B0] hover:text-white transition-colors"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-[#FFFD02]/10 border border-[#F5A623] text-[#FFF84D] text-sm px-4 py-3 rounded-xl">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FFFD02] hover:bg-[#E5EB00] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3.5 rounded-full transition-colors text-sm mt-1"
          >
            {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        {/* Separator */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-[#2A2A3A]" />
          <span className="text-xs text-[#A0A0B0] whitespace-nowrap">o continuá con</span>
          <div className="flex-1 h-px bg-[#2A2A3A]" />
        </div>

        {/* OAuth buttons */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={!!socialLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 font-semibold py-3 rounded-xl transition-colors text-sm"
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
            className="w-full flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {socialLoading === 'facebook'
              ? <span className="w-4 h-4 border-2 border-blue-300 border-t-white rounded-full animate-spin" />
              : <FacebookIcon />
            }
            Continuar con Facebook
          </button>
        </div>

        {/* Legal — only on register */}
        {mode === 'register' && (
          <p className="text-[11px] text-[#A0A0B0] text-center mt-6 leading-relaxed">
            Al registrarte aceptás nuestros{' '}
            <Link href="/terminos" className="underline hover:text-white transition-colors">
              Términos
            </Link>
            {' '}y la{' '}
            <Link href="/privacidad" className="underline hover:text-white transition-colors">
              Política de privacidad
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
