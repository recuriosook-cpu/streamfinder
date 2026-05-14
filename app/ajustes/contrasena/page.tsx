'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Lock, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { toast } from 'sonner'

function PasswordInput({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="text-xs font-medium text-[#A0A0B0] uppercase tracking-wider block mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? '••••••••'}
          className="w-full bg-[#1C1C27] border border-[#2A2A3A] text-white text-sm rounded-lg px-3 py-2.5 pr-10 outline-none placeholder-zinc-600 focus:ring-1 focus:ring-[#FFFD02]"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  )
}

function validate(newPass: string, confirm: string): string | null {
  if (newPass.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.'
  if (!/[A-Z]/.test(newPass)) return 'Debe incluir al menos una mayúscula.'
  if (!/[0-9]/.test(newPass)) return 'Debe incluir al menos un número.'
  if (newPass !== confirm) return 'Las contraseñas no coinciden.'
  return null
}

export default function CambiarContrasenaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading]     = useState(true)
  const [isOAuth, setIsOAuth]     = useState(false)
  const [email, setEmail]         = useState('')
  const [current, setCurrent]     = useState('')
  const [newPass, setNewPass]     = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // For OAuth users who want to set a password for the first time
  const [oauthNewPass,  setOauthNewPass]  = useState('')
  const [oauthConfirm, setOauthConfirm] = useState('')
  const [oauthError,   setOauthError]   = useState<string | null>(null)
  const [oauthBusy,    setOauthBusy]    = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      const provider = (data.user.app_metadata?.provider as string | undefined) ?? 'email'
      setIsOAuth(provider !== 'email')
      setEmail(data.user.email ?? '')
      setLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate(newPass, confirm)
    if (validationError) { setError(validationError); return }
    setError(null)
    setSubmitting(true)

    // Re-authenticate with current password
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current })
    if (signInErr) {
      setError('Contraseña actual incorrecta.')
      setSubmitting(false)
      return
    }

    // Update password
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPass })
    if (updateErr) {
      setError(updateErr.message)
      setSubmitting(false)
      return
    }

    toast.success('¡Contraseña actualizada!')
    router.push('/ajustes')
  }

  async function handleOAuthSetPassword(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validate(oauthNewPass, oauthConfirm)
    if (validationError) { setOauthError(validationError); return }
    setOauthError(null)
    setOauthBusy(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password: oauthNewPass })
    if (updateErr) {
      setOauthError(updateErr.message)
      setOauthBusy(false)
      return
    }
    toast.success('¡Contraseña configurada!')
    router.push('/ajustes')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="max-w-lg mx-auto px-4 py-8">

        <div className="flex items-center gap-3 mb-8">
          <Link href="/ajustes" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-white">Cambiar contraseña</h1>
        </div>

        {isOAuth ? (
          <div className="space-y-6">
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <Lock size={18} className="text-[#A0A0B0] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-white">Iniciaste sesión con Google / Facebook</p>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Tu cuenta no tiene contraseña porque la creaste con un proveedor externo.
                    Si querés configurar una contraseña adicional para poder iniciar sesión
                    también con email, podés hacerlo acá.
                  </p>
                </div>
              </div>

              <form onSubmit={handleOAuthSetPassword} className="space-y-4">
                  <PasswordInput label="Nueva contraseña" value={oauthNewPass} onChange={setOauthNewPass} />
                  <PasswordInput label="Confirmar contraseña" value={oauthConfirm} onChange={setOauthConfirm} />

                  {oauthError && (
                    <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                      {oauthError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={oauthBusy || !oauthNewPass || !oauthConfirm}
                    className="w-full py-2.5 rounded-lg bg-[#FFFD02] hover:bg-[#E5EB00] text-black text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {oauthBusy ? 'Configurando...' : 'Configurar contraseña'}
                  </button>
                </form>
            </div>
          </div>
        ) : (
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <PasswordInput label="Contraseña actual" value={current} onChange={setCurrent} />
                <PasswordInput label="Nueva contraseña" value={newPass} onChange={setNewPass} />
                <PasswordInput label="Confirmar nueva contraseña" value={confirm} onChange={setConfirm} />

                <ul className="text-[11px] text-zinc-600 space-y-0.5 pt-1">
                  <li className={newPass.length >= 8 ? 'text-green-500' : ''}>• Mínimo 8 caracteres</li>
                  <li className={/[A-Z]/.test(newPass) ? 'text-green-500' : ''}>• Al menos una mayúscula</li>
                  <li className={/[0-9]/.test(newPass) ? 'text-green-500' : ''}>• Al menos un número</li>
                  <li className={newPass && newPass === confirm ? 'text-green-500' : ''}>• Las contraseñas coinciden</li>
                </ul>

                {error && (
                  <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || !current || !newPass || !confirm}
                  className="w-full py-2.5 rounded-lg bg-[#FFFD02] hover:bg-[#E5EB00] text-black text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Cambiando...' : 'Cambiar contraseña'}
                </button>
              </form>
          </div>
        )}
      </div>
    </div>
  )
}
