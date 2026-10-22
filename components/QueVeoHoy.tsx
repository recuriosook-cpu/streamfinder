'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { track } from '@/lib/analytics'
import { buildProviderUrl } from '@/lib/providers'
import { useCountry } from '@/context/CountryContext'
import type { Compania, Ganas, ResultadoQueVeoHoy } from '@/lib/que-veo-hoy'

/**
 * "¿Qué veo hoy?": dos preguntas (con quién y qué ganas) y UNA recomendación
 * a pantalla completa, con "La veo", "Otra" (hasta 3) y "Guardar para
 * después". La próxima vez ofrece "¿Lo mismo que la última vez?". Reemplaza al
 * recomendador por ánimo. Es lo mismo que `QueVeoHoy` de la app; las dos usan
 * `/api/que-veo-hoy` (`lib/que-veo-hoy.ts`).
 */

const COMPANIAS: { id: Compania; texto: string }[] = [
  { id: 'solo', texto: 'Solo' },
  { id: 'pareja', texto: 'En pareja' },
  { id: 'amigos', texto: 'Con amigos' },
  { id: 'familia', texto: 'En familia' },
]
const GANAS: { id: Ganas; texto: string }[] = [
  { id: 'reirme', texto: 'Reírme' },
  { id: 'tension', texto: 'Tensión' },
  { id: 'emocionarme', texto: 'Emocionarme' },
  { id: 'liviano', texto: 'Algo liviano' },
  { id: 'sorprendeme', texto: 'Sorprendeme' },
]
const OTRAS_MAXIMO = 3

const ULTIMA_KEY = 'glynbox_que_veo_hoy_ultima'
const MOSTRADAS_KEY = 'glynbox_que_veo_hoy_mostradas'
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000

type Respuestas = { compania: Compania; ganas: Ganas }
type Paso = 'inicio' | 'preguntas' | 'buscando' | 'nada' | 'error'

function leer<T>(clave: string): T | null {
  try { const raw = localStorage.getItem(clave); return raw ? (JSON.parse(raw) as T) : null } catch { return null }
}
function escribir(clave: string, valor: unknown): void {
  try { localStorage.setItem(clave, JSON.stringify(valor)) } catch { /* sin storage */ }
}

/** Lo mostrado en la última semana: no vuelve. */
function mostradas(): Record<string, number> {
  const ahora = Date.now()
  return Object.fromEntries(Object.entries(leer<Record<string, number>>(MOSTRADAS_KEY) ?? {}).filter(([, en]) => ahora - en < SEMANA_MS))
}
function anotarMostrada(r: ResultadoQueVeoHoy): void {
  escribir(MOSTRADAS_KEY, { ...mostradas(), [`${r.mediaType}:${r.id}`]: Date.now() })
}

export default function QueVeoHoy() {
  const router = useRouter()
  const { country } = useCountry()
  const [paso, setPaso] = useState<Paso>('inicio')
  const [compania, setCompania] = useState<Compania | null>(null)
  const [ganas, setGanas] = useState<Ganas | null>(null)
  const [ultima, setUltima] = useState<Respuestas | null>(null)
  const [resultados, setResultados] = useState<ResultadoQueVeoHoy[]>([])
  const [indice, setIndice] = useState(0)
  const [abierto, setAbierto] = useState(false)

  // localStorage sólo existe en el navegador: se lee después de montar.
  useEffect(() => { setUltima(leer<Respuestas>(ULTIMA_KEY)) }, [])

  const actual = resultados[indice]
  const hayOtra = indice + 1 < resultados.length && indice < OTRAS_MAXIMO

  async function buscar(r: Respuestas, repetida: boolean) {
    setPaso('buscando')
    escribir(ULTIMA_KEY, r)
    setUltima(r)
    track('que_veo_hoy_respuestas', { compania: r.compania, ganas: r.ganas, repetida })
    try {
      const qs = new URLSearchParams({
        compania: r.compania, ganas: r.ganas, pais: country, idioma: 'es',
        excluir: Object.keys(mostradas()).slice(-60).join(','),
      })
      const res = await fetch(`/api/que-veo-hoy?${qs}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`${res.status}`)
      const encontradas = ((await res.json()) as { resultados?: ResultadoQueVeoHoy[] }).resultados ?? []
      if (encontradas.length === 0) { setPaso('nada'); return }
      setResultados(encontradas)
      setIndice(0)
      anotarMostrada(encontradas[0])
      track('que_veo_hoy_resultado', { intento: 1, fuente: encontradas[0].porque ? 'calificadas' : 'plataformas', media_type: encontradas[0].mediaType, media_id: encontradas[0].id })
      setAbierto(true)
      setPaso('inicio')
    } catch {
      setPaso('error')
    }
  }

  function elegir(c: Compania | null, g: Ganas | null) {
    setCompania(c)
    setGanas(g)
    if (c && g) void buscar({ compania: c, ganas: g }, false)
  }

  function accion(nombre: 'la_veo' | 'otra' | 'guardar' | 'cerrar') {
    track('que_veo_hoy_accion', { accion: nombre, intento: indice + 1, media_type: actual?.mediaType ?? null, media_id: actual?.id ?? null })
  }

  function laVeo() {
    if (!actual) return
    accion('la_veo')
    setAbierto(false)
    const url = actual.plataforma ? buildProviderUrl(actual.plataforma.id, actual.titulo) : null
    if (url) window.open(url, '_blank', 'noopener')
    else router.push(`/${actual.mediaType}/${actual.id}`)
  }

  function otra() {
    if (!hayOtra) return
    accion('otra')
    const siguiente = indice + 1
    setIndice(siguiente)
    anotarMostrada(resultados[siguiente])
    track('que_veo_hoy_resultado', { intento: siguiente + 1, fuente: resultados[siguiente].porque ? 'calificadas' : 'plataformas', media_type: resultados[siguiente].mediaType, media_id: resultados[siguiente].id })
  }

  async function guardar() {
    if (!actual) return
    accion('guardar')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }
    const { error } = await supabase.from('watchlist').upsert({
      user_id: user.id, media_id: actual.id, media_type: actual.mediaType,
      title: actual.titulo, poster_path: actual.posterPath, added_at: new Date().toISOString(),
    }, { onConflict: 'user_id,media_id,media_type' })
    if (error) toast.error('No se pudo guardar')
    else toast.success('Guardada en Ver después')
  }

  const chip = (activa: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
      activa ? 'border-[#FFFD02] bg-[#FFFD02] text-black' : 'border-[#2A2A3A] bg-[#13131A] text-white hover:border-zinc-500'
    }`

  return (
    <div className="max-w-7xl mx-auto px-4 pt-8 pb-6">
      <div className="rounded-2xl border border-[#FFFD02] bg-[#FFFD02]/5 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-[#FFFD02]" />
          <h1 className="text-xl sm:text-2xl font-black text-white">¿Qué veo hoy?</h1>
        </div>
        <p className="mt-1 text-sm text-[#A0A0B0]">Dos preguntas y te decimos qué ver de tus plataformas.</p>

        {paso === 'inicio' && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => { track('que_veo_hoy_abierto', { desde: 'que_ver' }); setCompania(null); setGanas(null); setPaso('preguntas') }}
              className="rounded-full bg-[#FFFD02] px-6 py-2.5 text-sm font-bold text-black hover:bg-[#E5EB00]"
            >
              Empezar
            </button>
            {ultima && (
              <button
                type="button"
                onClick={() => { track('que_veo_hoy_abierto', { desde: 'que_ver', repetida: true }); void buscar(ultima, true) }}
                className="text-sm font-semibold text-[#FFFD02] hover:underline"
              >
                ¿Lo mismo que la última vez?{' '}
                <span className="font-normal text-[#A0A0B0]">
                  {COMPANIAS.find(c => c.id === ultima.compania)?.texto} · {GANAS.find(g => g.id === ultima.ganas)?.texto}
                </span>
              </button>
            )}
          </div>
        )}

        {paso === 'preguntas' && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-white">¿Con quién?</p>
              <div className="flex flex-wrap gap-2">
                {COMPANIAS.map(c => (
                  <button key={c.id} type="button" onClick={() => elegir(c.id, ganas)} className={chip(compania === c.id)}>{c.texto}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-white">¿Qué tenés ganas?</p>
              <div className="flex flex-wrap gap-2">
                {GANAS.map(g => (
                  <button key={g.id} type="button" onClick={() => elegir(compania, g.id)} className={chip(ganas === g.id)}>{g.texto}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {paso === 'buscando' && (
          <p className="mt-4 flex items-center gap-2 text-sm text-[#A0A0B0]">
            <Loader2 size={16} className="animate-spin text-[#FFFD02]" /> Buscando en tus plataformas…
          </p>
        )}

        {(paso === 'nada' || paso === 'error') && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-[#A0A0B0]">
              {paso === 'nada'
                ? 'No encontramos nada con eso en tus plataformas. Probá con otras respuestas.'
                : 'No pudimos buscar. Probá de nuevo.'}
            </p>
            <button type="button" onClick={() => setPaso('preguntas')} className="rounded-full border border-[#FFFD02] px-5 py-2 text-sm font-bold text-[#FFFD02]">
              {paso === 'nada' ? 'Cambiar respuestas' : 'Probar de nuevo'}
            </button>
          </div>
        )}
      </div>

      {abierto && actual && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[#0A0A0F]">
          {(actual.backdropPath || actual.posterPath) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://image.tmdb.org/t/p/w780${actual.backdropPath ?? actual.posterPath}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-30 blur-2xl"
            />
          )}
          <div className="relative flex justify-end p-4">
            <button type="button" onClick={() => { accion('cerrar'); setAbierto(false) }} aria-label="Cerrar" className="text-white">
              <X size={28} />
            </button>
          </div>
          <div className="relative flex flex-1 flex-col items-center overflow-y-auto px-4">
            {actual.posterPath && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://image.tmdb.org/t/p/w500${actual.posterPath}`}
                alt={actual.titulo}
                className="w-[min(60vw,280px)] rounded-2xl shadow-2xl"
              />
            )}
            <h2 className="mt-5 text-center text-2xl font-black text-white">{actual.titulo}</h2>
            <p className="mt-1 text-sm text-[#A0A0B0]">
              {[actual.anio, actual.nota > 0 ? `★ ${actual.nota.toFixed(1)}` : null].filter(Boolean).join(' · ')}
            </p>
            {actual.plataforma && (
              <p className="mt-3 text-base font-semibold text-white">
                {actual.porque ? `En ${actual.plataforma.nombre}` : `Popular en ${actual.plataforma.nombre}`}
              </p>
            )}
            {actual.porque && (
              <p className="mt-2 text-center text-base font-semibold text-[#FFFD02]">Porque te gustó {actual.porque}</p>
            )}
          </div>
          <div className="relative mx-auto w-full max-w-md space-y-3 p-4">
            <button type="button" onClick={laVeo} className="w-full rounded-full bg-[#FFFD02] py-3 text-base font-bold text-black">
              La veo
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={otra}
                disabled={!hayOtra}
                className="flex-1 rounded-full border border-[#FFFD02] py-3 text-sm font-bold text-[#FFFD02] disabled:opacity-40"
              >
                {hayOtra ? 'Otra' : 'No hay más por hoy'}
              </button>
              <button
                type="button"
                onClick={() => void guardar()}
                className="flex-1 rounded-full border border-[#FFFD02] py-3 text-sm font-bold text-[#FFFD02]"
              >
                Guardar para después
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
