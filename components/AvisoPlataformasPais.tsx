'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useCountry } from '@/context/CountryContext'
import { getCountry } from '@/lib/countries'
import PlatformPicker, { alternarPlataforma } from '@/components/PlatformPicker'
import { traerPlataformas } from '@/lib/use-plataformas-pais'
import { juntarNombres, separarElegidas, type PlataformaPais } from '@/lib/plataformas-pais'
import { nombresDePlataformas } from '@/lib/nombres-plataformas'

/** Estas ya muestran la grilla del país y dicen lo que falta: no hace falta otro aviso encima. */
const SIN_AVISO = ['/onboarding', '/ajustes/plataformas']

/**
 * Al cambiar de país a mano (`cambio` de `CountryContext`): si tenía elegidas
 * plataformas que en el país nuevo no existen, lo dice y deja elegir las nuevas.
 *
 * "Ahora no" no toca el perfil: lo que no existe acá simplemente no cuenta para
 * recomendar (`lib/que-veo-hoy.ts`, `getFirstRecommendations`), y volver al país
 * de antes lo recupera. Sin sesión no hay plataformas guardadas. Si no se pudo
 * traer la lista no se dice nada: no se sabe qué falta.
 */
export default function AvisoPlataformasPais() {
  const { cambio } = useCountry()

  const [aviso, setAviso] = useState<{
    userId: string
    pais: string
    faltan: string[]
    lista: PlataformaPais[]
  } | null>(null)
  const [elegidas, setElegidas] = useState<number[]>([])
  const [guardando, setGuardando] = useState(false)

  const n = cambio?.n
  useEffect(() => {
    if (!cambio || SIN_AVISO.some(ruta => window.location.pathname.startsWith(ruta))) return
    const { a } = cambio
    let vivo = true
    void (async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const [{ data: perfil }, lista] = await Promise.all([
          supabase.from('profiles').select('favorite_platforms').eq('id', user.id).maybeSingle(),
          traerPlataformas(a),
        ])
        const guardadas = ((perfil?.favorite_platforms ?? []) as string[]).map(Number).filter(Number.isFinite)
        const { vigentes, faltantes } = separarElegidas(guardadas, lista)
        if (!vivo || faltantes.length === 0) return
        const faltan = await nombresDePlataformas(faltantes)
        if (!vivo) return
        setElegidas(vigentes)
        setAviso({ userId: user.id, pais: a, faltan, lista })
      } catch {
        // Sin perfil o sin lista no se puede decir qué falta.
      }
    })()
    return () => { vivo = false }
  }, [n]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!aviso) return null

  const pais = getCountry(aviso.pais).name
  const plural = aviso.faltan.length > 1

  async function guardar() {
    if (!aviso) return
    setGuardando(true)
    const { error } = await createClient()
      .from('profiles').update({ favorite_platforms: elegidas.map(String) }).eq('id', aviso.userId)
    setGuardando(false)
    if (error) { toast.error('No pudimos guardar tus plataformas. Probá de nuevo.'); return }
    toast.success('Plataformas guardadas')
    setAviso(null)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="aviso-plataformas-titulo">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-[#2A2A3A] bg-[#13131A] p-5">
        <h2 id="aviso-plataformas-titulo" className="text-lg font-bold text-white">Tus plataformas en {pais}</h2>
        <p className="mt-1 text-sm leading-relaxed text-[#A0A0B0]">
          {aviso.faltan.length > 0 ? juntarNombres(aviso.faltan) : 'Algunas de tus plataformas'}{' '}
          {plural || aviso.faltan.length === 0 ? 'no están' : 'no está'} en {pais}. Elegí las que tengas acá.
        </p>
        <div className="mt-4 flex-1 overflow-y-auto pt-2">
          <PlatformPicker
            plataformas={aviso.lista}
            selected={elegidas}
            onToggle={p => setElegidas(prev => alternarPlataforma(prev, p))}
            disabled={guardando}
          />
        </div>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="flex-1 rounded-full border border-[#2A2A3A] py-2.5 text-sm font-semibold text-white hover:border-zinc-500"
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando}
            className="flex-1 rounded-full bg-[#FFFD02] py-2.5 text-sm font-bold text-black hover:bg-[#E5EB00] disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
