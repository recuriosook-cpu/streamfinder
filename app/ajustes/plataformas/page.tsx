'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { normalizeSavedPlatforms } from '@/lib/onboarding'
import PlatformPicker, { alternarPlataforma } from '@/components/PlatformPicker'
import CountrySelector from '@/components/CountrySelector'
import { useCountry } from '@/context/CountryContext'
import { usePlataformasPais } from '@/lib/use-plataformas-pais'
import { juntarNombres, separarElegidas } from '@/lib/plataformas-pais'
import { nombresDePlataformas } from '@/lib/nombres-plataformas'

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
 *
 * La grilla es la del país elegido. Lo elegido que en ese país no existe se avisa
 * y se saca del perfil con el próximo toque: hasta entonces, volver al país de
 * antes lo recupera sin hacer nada.
 */
export default function PlataformasPage() {
  const router = useRouter()
  const supabase = createClient()
  const { country, countryData } = useCountry()
  const { plataformas: lista, cargando, fiable } = usePlataformasPais(country)

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [platforms, setPlatforms] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [nombresFaltantes, setNombresFaltantes] = useState<string[]>([])

  // Con la lista de respaldo no se puede saber qué falta: no se dice ni se saca nada.
  const { vigentes, faltantes } = fiable ? separarElegidas(platforms, lista) : { vigentes: platforms, faltantes: [] as number[] }
  const faltantesClave = faltantes.join(',')

  useEffect(() => {
    if (!faltantesClave) return
    let vivo = true
    void nombresDePlataformas(faltantesClave.split(',').map(Number)).then(n => { if (vivo) setNombresFaltantes(n) })
    return () => { vivo = false }
  }, [faltantesClave])

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

  async function handleToggle(p: Parameters<typeof alternarPlataforma>[1]) {
    if (!userId || saving) return
    const previas = platforms
    const next = alternarPlataforma(vigentes, p)
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
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-sm font-semibold text-white">Plataformas en {countryData.name}</p>
            <CountrySelector variant="compact" align="right" />
          </div>
          {faltantes.length > 0 && (
            <p className="text-xs text-[#FFFD02] mb-4 leading-relaxed">
              {nombresFaltantes.length > 0 ? juntarNombres(nombresFaltantes) : 'Algunas de tus plataformas'} no{' '}
              {faltantes.length === 1 ? 'está' : 'están'} en {countryData.name}. Elegí las que tengas acá.
            </p>
          )}
          <p className="text-xs text-zinc-500 mb-5 leading-relaxed">
            Las que tenés. Con esto te decimos dónde ver cada título, te recomendamos lo que está
            en tus plataformas y te avisamos cuando algo de tu &quot;Ver después&quot; llega a una de ellas.
          </p>
          <PlatformPicker plataformas={lista} cargando={cargando} selected={vigentes} onToggle={handleToggle} disabled={saving} />
        </div>

        <p className="text-xs text-zinc-600 text-center">
          {vigentes.length === 0
            ? 'No elegiste ninguna. Los cambios se guardan automáticamente.'
            : `${vigentes.length} ${vigentes.length === 1 ? 'elegida' : 'elegidas'}. Los cambios se guardan automáticamente.`}
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
