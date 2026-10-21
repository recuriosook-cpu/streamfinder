'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { normalizeSavedPlatforms } from '@/lib/onboarding'
import PlatformPicker from '@/components/PlatformPicker'

/**
 * "Mis plataformas": cambiar `profiles.favorite_platforms` después del
 * onboarding. Antes no había forma, y el final del onboarding mandaba a
 * "Ajustes" a elegirlas.
 *
 * Mismo formato que el onboarding: array de ids de TMDB como texto. Al cargar
 * pasa por `normalizeSavedPlatforms`, que convierte ids viejos (384 → 1899),
 * así que guardar acá también los deja al día.
 *
 * Se guarda en cada toque, como Notificaciones. Si falla, vuelve atrás.
 */
export default function PlataformasPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [platforms, setPlatforms] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      supabase
        .from('profiles')
        .select('favorite_platforms')
        .eq('id', data.user.id)
        .maybeSingle()
        .then(({ data: p }) => {
          setPlatforms(normalizeSavedPlatforms(p?.favorite_platforms as string[] | null))
          setLoading(false)
        })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(id: number) {
    if (!userId || saving) return
    const previas = platforms
    const next = platforms.includes(id) ? platforms.filter(p => p !== id) : [...platforms, id]
    setPlatforms(next)
    setSaving(true)
    const { error } = await supabase
      .from('profiles').update({ favorite_platforms: next.map(String) }).eq('id', userId)
    if (error) {
      setPlatforms(previas)
      setToast('Error al guardar. Intentá de nuevo.')
    } else {
      setToast('Guardado')
    }
    setSaving(false)
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
          <h1 className="text-2xl font-bold text-white">Mis plataformas</h1>
        </div>

        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
            Las que tenés. Con esto te decimos dónde ver cada título, te recomendamos lo que está
            en tus plataformas y te avisamos cuando algo de tu &quot;Ver después&quot; llega a una de ellas.
          </p>
          <PlatformPicker selected={platforms} onToggle={handleToggle} disabled={saving} />
        </div>

        <p className="text-xs text-zinc-600 text-center">
          {platforms.length === 0
            ? 'No elegiste ninguna. Los cambios se guardan automáticamente.'
            : `${platforms.length} ${platforms.length === 1 ? 'elegida' : 'elegidas'}. Los cambios se guardan automáticamente.`}
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
