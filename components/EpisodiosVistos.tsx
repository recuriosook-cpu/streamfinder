'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, CheckCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { sinEstrenar, type TmdbSeason } from '@/lib/seasons'
import { claveCapitulo, progresoSerie, textoProgreso } from '@/lib/episodios-vistos'

/**
 * Capítulos vistos en la web: tildes por capítulo, marcar o desmarcar la
 * temporada entera y el progreso de la serie. Tabla `episodios_vistos` (ver
 * `lib/episodios-vistos.ts`), la misma que usa la app.
 *
 * Todo se carga en el navegador: la ficha y la temporada se cachean en la CDN
 * y se generan como anónimo, así que el HTML no lleva nada de esto (Google ve
 * la página igual que antes). Hasta saber quién es, no se muestra nada.
 */

interface Contexto {
  listo: boolean
  userId: string | null
  vistos: Set<string>
  /** Marca o desmarca capítulos de una temporada. Sin sesión, lleva a iniciarla. */
  marcar: (temporada: number, capitulos: number[], visto: boolean) => void
}

const VistosContext = createContext<Contexto | null>(null)

export function EpisodiosVistosProvider({ serieId, children }: { serieId: number; children: ReactNode }) {
  const router = useRouter()
  const [supabase] = useState(createClient)
  const [listo, setListo] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [vistos, setVistos] = useState<Set<string>>(new Set())

  useEffect(() => {
    let vivo = true
    const traer = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { user: null, filas: [] }
      const { data, error } = await supabase
        .from('episodios_vistos')
        .select('temporada, capitulo')
        .eq('user_id', user.id)
        .eq('serie_id', serieId)
      if (error) console.error('[episodios_vistos] traer:', error)
      return { user: user.id, filas: (data ?? []) as { temporada: number; capitulo: number }[] }
    }
    traer()
      .then(({ user, filas }) => {
        if (!vivo) return
        setUserId(user)
        setVistos(new Set(filas.map(f => claveCapitulo(f.temporada, f.capitulo))))
        setListo(true)
      })
      .catch(err => {
        console.error('[episodios_vistos] traer:', err)
        if (vivo) setListo(true)
      })
    return () => { vivo = false }
  }, [supabase, serieId])

  /** Cambia acá primero y guarda después; si falla, deshace sólo ese cambio y avisa. */
  const marcar = useCallback((temporada: number, capitulos: number[], visto: boolean) => {
    if (!userId) { router.push('/auth'); return }
    if (capitulos.length === 0) return
    const claves = capitulos.map(c => claveCapitulo(temporada, c))
    const poner = (marcado: boolean) => setVistos(prev => {
      const s = new Set(prev)
      for (const k of claves) {
        if (marcado) s.add(k)
        else s.delete(k)
      }
      return s
    })
    poner(visto)

    const guardar = visto
      ? supabase.from('episodios_vistos').upsert(
          capitulos.map(capitulo => ({ user_id: userId, serie_id: serieId, temporada, capitulo })),
          // Ya marcado: queda como está, con su fecha original.
          { onConflict: 'user_id,serie_id,temporada,capitulo', ignoreDuplicates: true },
        )
      : supabase.from('episodios_vistos').delete()
          .eq('user_id', userId).eq('serie_id', serieId)
          .eq('temporada', temporada).in('capitulo', capitulos)

    Promise.resolve(guardar).then(({ error }) => {
      if (!error) return
      console.error('[episodios_vistos] guardar:', error)
      poner(!visto)
      toast.error('No pudimos guardar los capítulos vistos. Probá de nuevo.')
    })
  }, [userId, supabase, serieId, router])

  return (
    <VistosContext.Provider value={{ listo, userId, vistos, marcar }}>
      {children}
    </VistosContext.Provider>
  )
}

/**
 * "Viste 14 de 30 capítulos · Vas por T2 E4", con una barrita. Sin los
 * Especiales. Si todavía no marcó ninguno (o no hay sesión), no ocupa lugar.
 */
export function ProgresoSerie({ seasons }: { seasons: TmdbSeason[] | null | undefined }) {
  const ctx = useContext(VistosContext)
  if (!ctx?.listo || !ctx.userId) return null
  const p = progresoSerie(seasons, ctx.vistos)
  if (p.vistos === 0 || p.total === 0) return null
  return (
    <div className="mb-3">
      <p className="text-sm text-[#A0A0B0]">{textoProgreso(p)}</p>
      <div className="mt-1.5 h-1 rounded-full bg-[#2A2A3A] overflow-hidden max-w-sm">
        <div className="h-1 rounded-full bg-[#FFFD02]" style={{ width: `${Math.min(100, (p.vistos / p.total) * 100)}%` }} />
      </div>
    </div>
  )
}

/**
 * El tilde de visto de un capítulo. Sólo en los ya estrenados (la fecha se
 * mira en el navegador: la página puede estar cacheada desde ayer).
 */
export function TildeVisto({ temporada, capitulo, airDate }: { temporada: number; capitulo: number; airDate: string | null }) {
  const ctx = useContext(VistosContext)
  if (!ctx?.listo || sinEstrenar({ air_date: airDate })) return null
  const visto = ctx.vistos.has(claveCapitulo(temporada, capitulo))
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={visto}
      aria-label={`Marcar el capítulo ${capitulo} como visto`}
      title={visto ? 'Visto' : 'Marcar como visto'}
      onClick={() => ctx.marcar(temporada, [capitulo], !visto)}
      className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
        visto
          ? 'bg-[#FFFD02] border-[#FFFD02] text-black hover:bg-[#E5EB00]'
          : 'border-[#3A3A4A] text-[#A0A0B0] hover:border-zinc-400 hover:text-white'
      }`}
    >
      <Check size={18} strokeWidth={visto ? 3 : 2} />
    </button>
  )
}

/**
 * "Marcar todos" / "Desmarcar todos": la temporada entera, sólo los capítulos
 * ya estrenados. Desmarca cuando ya están todos vistos.
 */
export function MarcarTemporada({
  temporada,
  episodios,
}: {
  temporada: number
  episodios: { episode_number: number; air_date: string | null }[]
}) {
  const ctx = useContext(VistosContext)
  if (!ctx?.listo) return null
  const estrenados = episodios.filter(e => !sinEstrenar(e)).map(e => e.episode_number)
  if (estrenados.length === 0) return null
  const todos = estrenados.every(n => ctx.vistos.has(claveCapitulo(temporada, n)))
  const alternar = () => {
    if (todos) ctx.marcar(temporada, estrenados, false)
    else ctx.marcar(temporada, estrenados.filter(n => !ctx.vistos.has(claveCapitulo(temporada, n))), true)
  }
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={todos ? 'Desmarcar los capítulos vistos de la temporada' : 'Marcar la temporada entera como vista'}
      className={`inline-flex items-center gap-1.5 text-sm transition-colors ${todos ? 'text-[#FFFD02] hover:text-[#E5EB00]' : 'text-[#A0A0B0] hover:text-white'}`}
    >
      <CheckCheck size={18} />
      {todos ? 'Desmarcar todos' : 'Marcar todos'}
    </button>
  )
}
