'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle, AlertTriangle, Check, ExternalLink, Loader2, Plus, Search, Trash2,
} from 'lucide-react'
import { RefrescoControl, useRefrescoAlVolver } from '@/app/admin/_components/Refresco'
import { codigoDePost, fichaDeLink } from '@/lib/instagram-covers'
import type { RecomendacionAdmin } from '@/app/api/admin/recomendaciones/route'

/**
 * Carga de recomendaciones de creadores, de a una: el link del post de
 * Instagram y el de la ficha de Glynbox. Todo lo demás (portada, WebP,
 * Storage, fila) lo hace `/api/admin/recomendaciones`; ver ahí.
 */

interface Creador { id: number; name: string; username: string }

type Resultado =
  | { tipo: 'ok'; item: RecomendacionAdmin }
  | { tipo: 'duplicado'; mensaje: string; existente: RecomendacionAdmin | null }
  | { tipo: 'error'; mensaje: string }

const input =
  'w-full bg-[#0A0A0F] border border-[#2A2A3A] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#FFFD02]/60'

function titulo(r: RecomendacionAdmin) {
  return r.title ?? `${r.mediaType === 'movie' ? 'Película' : 'Serie'} ${r.tmdbId}`
}

export default function AdminRecomendacionesPage() {
  const [items,     setItems]     = useState<RecomendacionAdmin[]>([])
  const [creadores, setCreadores] = useState<Creador[]>([])
  const [cargando,  setCargando]  = useState(false)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null)

  const [post,      setPost]      = useState('')
  const [ficha,     setFicha]     = useState('')
  const [creadorId, setCreadorId] = useState<number | null>(null)
  const [enviando,  setEnviando]  = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const [filtro,     setFiltro]     = useState('')
  const [confirmar,  setConfirmar]  = useState<number | null>(null)
  const [borrandoId, setBorrandoId] = useState<number | null>(null)

  useEffect(() => { cargar() }, [])
  useRefrescoAlVolver(cargar, actualizadoEn)

  async function cargar() {
    setCargando(true)
    setErrorLista(null)
    try {
      const res  = await fetch('/api/admin/recomendaciones', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? `Error ${res.status}`)
      setItems(data.items)
      setCreadores(data.creators)
      setCreadorId(prev => prev ?? data.creators[0]?.id ?? null)
      setActualizadoEn(new Date())
    } catch (e) {
      setErrorLista(e instanceof Error ? e.message : 'No se pudo cargar la lista.')
    } finally {
      setCargando(false)
    }
  }

  // Validación en el momento, con las mismas funciones que usa el servidor.
  const postInvalido  = post.trim()  !== '' && !codigoDePost(post)
  const fichaInvalida = ficha.trim() !== '' && !fichaDeLink(ficha)
  const puedeEnviar = !enviando && !!creadorId && !!codigoDePost(post) && !!fichaDeLink(ficha)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!puedeEnviar) return
    setEnviando(true)
    setResultado(null)
    try {
      const res  = await fetch('/api/admin/recomendaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post, ficha, creatorId: creadorId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResultado({ tipo: 'ok', item: data.item })
        setItems(prev => [data.item, ...prev])
        setPost('')
        setFicha('')
      } else if (res.status === 409) {
        setResultado({ tipo: 'duplicado', mensaje: data.message, existente: data.existente ?? null })
      } else {
        setResultado({ tipo: 'error', mensaje: data.message ?? `Error ${res.status}` })
      }
    } catch {
      setResultado({ tipo: 'error', mensaje: 'Error de red. Revisá la conexión y probá de nuevo.' })
    } finally {
      setEnviando(false)
    }
  }

  async function borrar(r: RecomendacionAdmin) {
    setBorrandoId(r.id)
    try {
      const res  = await fetch(`/api/admin/recomendaciones?id=${r.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 404) throw new Error(data.message ?? `Error ${res.status}`)
      setItems(prev => prev.filter(i => i.id !== r.id))
      if (resultado?.tipo === 'ok' && resultado.item.id === r.id) setResultado(null)
      toast.success(`Borrada: ${titulo(r)}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar.')
    } finally {
      setBorrandoId(null)
      setConfirmar(null)
    }
  }

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return items
    return items.filter(i =>
      (i.title ?? '').toLowerCase().includes(q) ||
      i.code.toLowerCase().includes(q) ||
      String(i.tmdbId) === q
    )
  }, [items, filtro])

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-6 py-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Recomendaciones</h1>
          <p className="text-sm text-[#A0A0B0] mt-0.5">{items.length} cargadas</p>
        </div>
        <RefrescoControl actualizadoEn={actualizadoEn} cargando={cargando} onActualizar={cargar} />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Formulario */}
        <form onSubmit={enviar} className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 space-y-4">
          <p className="text-sm font-semibold text-white">Cargar una recomendación</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-[#A0A0B0]">Link del post de Instagram</span>
              <input
                className={`${input} mt-1.5`}
                placeholder="https://www.instagram.com/p/…"
                value={post}
                onChange={e => setPost(e.target.value)}
                disabled={enviando}
                inputMode="url"
              />
              {postInvalido && <span className="text-[11px] text-red-400 mt-1 block">No parece un link a un post o reel.</span>}
            </label>
            <label className="block">
              <span className="text-xs text-[#A0A0B0]">Link de la ficha de Glynbox</span>
              <input
                className={`${input} mt-1.5`}
                placeholder="https://www.glynbox.com/movie/…"
                value={ficha}
                onChange={e => setFicha(e.target.value)}
                disabled={enviando}
                inputMode="url"
              />
              {fichaInvalida && <span className="text-[11px] text-red-400 mt-1 block">Tiene que ser glynbox.com/movie/… o /tv/….</span>}
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {creadores.length > 1 ? (
              <select
                className="bg-[#0A0A0F] border border-[#2A2A3A] rounded-xl px-3 py-2.5 text-sm text-white"
                value={creadorId ?? ''}
                onChange={e => setCreadorId(Number(e.target.value))}
                disabled={enviando}
              >
                {creadores.map(c => <option key={c.id} value={c.id}>{c.name} (@{c.username})</option>)}
              </select>
            ) : creadores[0] ? (
              <span className="text-xs text-[#A0A0B0]">Creador: <span className="text-white">{creadores[0].name}</span></span>
            ) : null}

            <button
              type="submit"
              disabled={!puedeEnviar}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFFD02] text-black text-sm font-semibold disabled:opacity-40 transition-opacity"
            >
              {enviando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {enviando ? 'Bajando portada…' : 'Cargar'}
            </button>
          </div>

          {resultado && <ResultadoCarga resultado={resultado} />}
        </form>

        {/* Lista */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                className={`${input} pl-9`}
                placeholder="Buscar por título, código del post o id de TMDB"
                value={filtro}
                onChange={e => setFiltro(e.target.value)}
              />
            </div>
            {filtro && <span className="text-xs text-[#A0A0B0] shrink-0">{visibles.length} de {items.length}</span>}
          </div>

          {errorLista && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{errorLista}</p>
            </div>
          )}

          {cargando && items.length === 0 && (
            <div className="flex justify-center py-16">
              <Loader2 size={24} className="animate-spin text-[#FFFD02]" />
            </div>
          )}

          {!cargando && !errorLista && visibles.length === 0 && (
            <p className="text-center text-sm text-[#A0A0B0] py-12">
              {filtro ? 'Nada coincide con la búsqueda.' : 'Todavía no hay recomendaciones cargadas.'}
            </p>
          )}

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map(r => (
              <div key={r.id} className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-3 flex gap-3">
                <a href={`https://www.instagram.com/p/${r.code}/`} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.coverUrl} alt="" loading="lazy" className="w-16 aspect-[9/16] object-cover rounded-lg bg-zinc-800" />
                </a>
                <div className="flex-1 min-w-0 flex flex-col">
                  <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{titulo(r)}</p>
                  <p className="text-[11px] text-[#A0A0B0] mt-0.5">
                    {r.mediaType === 'movie' ? 'Película' : 'Serie'}{r.year ? ` · ${r.year}` : ''}
                    {creadores.length > 1 && r.creator ? ` · ${r.creator.name}` : ''}
                  </p>
                  {!r.embeddable && (
                    <p className="text-[10px] text-amber-400 mt-1">Sin inserción: abre Instagram</p>
                  )}
                  <div className="mt-auto pt-2 flex items-center gap-3 text-[11px]">
                    <a href={`/${r.mediaType}/${r.tmdbId}`} target="_blank" className="inline-flex items-center gap-1 text-zinc-400 hover:text-white">
                      <ExternalLink size={11} /> Ficha
                    </a>
                    <a href={`https://www.instagram.com/p/${r.code}/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-400 hover:text-white">
                      <ExternalLink size={11} /> Post
                    </a>
                    {confirmar === r.id ? (
                      <span className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => borrar(r)}
                          disabled={borrandoId === r.id}
                          className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 font-semibold disabled:opacity-50"
                        >
                          {borrandoId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Borrar
                        </button>
                        <button onClick={() => setConfirmar(null)} disabled={borrandoId === r.id} className="text-zinc-500 hover:text-white">
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmar(r.id)}
                        className="ml-auto inline-flex items-center gap-1 text-zinc-600 hover:text-red-400"
                        aria-label={`Borrar ${titulo(r)}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultadoCarga({ resultado }: { resultado: Resultado }) {
  if (resultado.tipo === 'error') {
    return (
      <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertCircle size={17} className="text-red-400 shrink-0 mt-0.5" />
        <p className="text-sm text-red-300">{resultado.mensaje}</p>
      </div>
    )
  }

  const r = resultado.tipo === 'ok' ? resultado.item : resultado.existente
  const ok = resultado.tipo === 'ok'

  return (
    <div className={`rounded-xl px-4 py-3 flex items-start gap-3 border ${ok ? 'bg-emerald-900/20 border-emerald-800' : 'bg-amber-900/20 border-amber-700'}`}>
      {r && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.coverUrl} alt="" className="w-12 aspect-[9/16] object-cover rounded-md bg-zinc-800 shrink-0" />
      )}
      <div className="min-w-0">
        <p className={`text-sm font-semibold flex items-center gap-1.5 ${ok ? 'text-emerald-300' : 'text-amber-300'}`}>
          {ok ? <Check size={15} /> : <AlertTriangle size={15} />}
          {ok ? 'Cargada' : 'Ya estaba cargado'}
        </p>
        <p className="text-sm text-zinc-300 mt-0.5">
          {ok && r ? `${titulo(r)}${r.year ? ` (${r.year})` : ''}. Ya se ve en la ficha.` : resultado.tipo === 'duplicado' ? resultado.mensaje : ''}
        </p>
        {ok && r && !r.embeddable && (
          <p className="text-xs text-amber-300 mt-1">
            Instagram no dio la portada limpia: se usó la que trae el botón de play, y en la web este post abre Instagram en vez del reproductor (la inserción suele estar deshabilitada en estos casos).
          </p>
        )}
        {r && (
          <a href={`/${r.mediaType}/${r.tmdbId}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white mt-1.5">
            <ExternalLink size={11} /> Ver la ficha
          </a>
        )}
      </div>
    </div>
  )
}
