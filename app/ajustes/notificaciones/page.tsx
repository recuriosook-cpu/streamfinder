'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Bell, BellOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import {
  isPushSupported, requestPushPermission,
  unsubscribePush, getCurrentPushEndpoint,
} from '@/lib/push-notifications'

interface NotifPrefs {
  likes:          boolean
  follows:        boolean
  comments:       boolean
  replies:        boolean
  mentions:       boolean
  level_up:       boolean
  actor_birthday: boolean
  new_release:    boolean
}

const DEFAULT_PREFS: NotifPrefs = {
  likes: true, follows: true, comments: true, replies: true,
  mentions: true, level_up: true, actor_birthday: true, new_release: true,
}

const TOGGLES: { key: keyof NotifPrefs; label: string; description: string }[] = [
  { key: 'likes',          label: 'Likes en mis reseñas',            description: 'Cuando alguien le da me gusta a una reseña tuya' },
  { key: 'follows',        label: 'Nuevos seguidores',               description: 'Cuando alguien empieza a seguirte' },
  { key: 'comments',       label: 'Comentarios en mis reseñas',      description: 'Cuando alguien comenta en tus reseñas' },
  { key: 'replies',        label: 'Respuestas a mis comentarios',    description: 'Cuando alguien responde uno de tus comentarios' },
  { key: 'mentions',       label: 'Menciones con @',                 description: 'Cuando alguien te menciona en una reseña o comentario' },
  { key: 'level_up',       label: 'Subida de nivel',                 description: 'Cuando acumulás suficientes puntos para subir de nivel' },
  { key: 'actor_birthday', label: 'Cumpleaños de actores que sigo',  description: 'Recordatorio cuando cumple años un actor que seguís' },
  { key: 'new_release',    label: 'Estrenos de actores que sigo',    description: 'Cuando se estrena algo nuevo de un actor que seguís' },
]

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
        on ? 'bg-[#FFFD02] border-[#FFFD02]' : 'bg-zinc-700 border-zinc-700'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-black shadow transform transition-transform duration-200 mt-[2px] ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export default function NotificacionesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading,      setLoading]      = useState(true)
  const [userId,       setUserId]       = useState<string | null>(null)
  const [prefs,        setPrefs]        = useState<NotifPrefs>(DEFAULT_PREFS)
  const [toast,        setToast]        = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)

  // Push state
  const [pushSupported, setPushSupported] = useState(false)
  const [pushActive,    setPushActive]    = useState(false)
  const [pushBusy,      setPushBusy]     = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', data.user.id)
        .maybeSingle()
        .then(({ data: p }) => {
          if (p?.notification_preferences) {
            setPrefs({ ...DEFAULT_PREFS, ...(p.notification_preferences as Partial<NotifPrefs>) })
          }
          setLoading(false)
        })
    })

    // Check push support + current subscription
    if (isPushSupported()) {
      setPushSupported(true)
      getCurrentPushEndpoint().then(ep => setPushActive(!!ep))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(key: keyof NotifPrefs, value: boolean) {
    if (!userId || saving) return
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    setSaving(true)
    const { error } = await supabase
      .from('profiles').update({ notification_preferences: next }).eq('id', userId)
    if (error) {
      setPrefs(prefs)
      setToast('Error al guardar. Intentá de nuevo.')
    } else {
      setToast('Guardado')
    }
    setSaving(false)
    setTimeout(() => setToast(null), 2000)
  }

  async function handleActivatePush() {
    if (!userId || pushBusy) return
    setPushBusy(true)
    const ok = await requestPushPermission(userId)
    if (ok) {
      setPushActive(true)
      setToast('Notificaciones activadas')
    } else {
      setToast('No se pudo activar. Verificá los permisos del navegador.')
    }
    setPushBusy(false)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDeactivatePush() {
    if (pushBusy) return
    setPushBusy(true)
    await unsubscribePush()
    setPushActive(false)
    setToast('Notificaciones desactivadas')
    setPushBusy(false)
    setTimeout(() => setToast(null), 2000)
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
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        <div className="flex items-center gap-3">
          <Link href="/ajustes" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-white">Notificaciones</h1>
        </div>

        {/* ── Push banner ─────────────────────────────────── */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <p className="text-sm font-semibold text-white mb-1">Notificaciones push</p>
          <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
            Recibí notificaciones en este dispositivo aunque no tengas la app abierta.
          </p>

          {!pushSupported ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-800/50 rounded-lg px-3 py-2.5">
              <BellOff size={14} />
              Tu navegador no soporta notificaciones push.
            </div>
          ) : pushActive ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Bell size={15} />
                Notificaciones activadas en este dispositivo
              </div>
              <button
                onClick={handleDeactivatePush}
                disabled={pushBusy}
                className="text-xs text-zinc-500 hover:text-white transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pushBusy ? <Loader2 size={13} className="animate-spin" /> : 'Desactivar'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleActivatePush}
              disabled={pushBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#FFFD02] hover:bg-[#E5EB00] text-black text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pushBusy
                ? <><Loader2 size={14} className="animate-spin" /> Activando...</>
                : <><Bell size={14} /> Activar notificaciones en este dispositivo</>
              }
            </button>
          )}
        </div>

        {/* ── Preference toggles ───────────────────────────── */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl overflow-hidden divide-y divide-[#2A2A3A]/50">
          {TOGGLES.map(({ key, label, description }) => (
            <div key={key} className="flex items-center gap-4 px-4 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</p>
              </div>
              <Toggle on={prefs[key]} onChange={v => handleToggle(key, v)} />
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-600 text-center">
          Los cambios se guardan automáticamente.
        </p>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#13131A] border border-[#FFFD02]/40 rounded-full shadow-2xl text-sm font-medium text-[#FFFD02] pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}
