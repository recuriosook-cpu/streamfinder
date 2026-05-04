'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase'
import { Upload, CheckCircle, AlertCircle, Loader2, Film, Star, Bookmark, FileText, ChevronRight } from 'lucide-react'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

// ── Types ────────────────────────────────────────────────────────────────────

interface LbWatched   { Date: string; Name: string; Year: string; 'Letterboxd URI': string; Rating?: string }
interface LbRating    { Date: string; Name: string; Year: string; 'Letterboxd URI': string; Rating: string }
interface LbWatchlist { Date: string; Name: string; Year: string; 'Letterboxd URI': string }
interface LbReview    { Date: string; Name: string; Year: string; 'Letterboxd URI': string; Rating: string; Review: string }

interface ParsedFiles {
  watched:   LbWatched[]
  ratings:   LbRating[]
  watchlist: LbWatchlist[]
  reviews:   LbReview[]
}

interface ImportResult {
  watchedImported: number
  ratingsImported: number
  watchlistImported: number
  reviewsImported: number
  notFound: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function parseCSV<T>(text: string): T[] {
  const result = Papa.parse<T>(text, { header: true, skipEmptyLines: true })
  return result.data
}

async function searchTMDB(name: string, year: string): Promise<{ id: number; title: string; poster_path: string | null } | null> {
  if (!TMDB_KEY) return null
  try {
    const q = encodeURIComponent(name)
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=es-AR&query=${q}&year=${year}&page=1`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const first = data.results?.[0]
    if (!first) {
      // Retry without year constraint
      const url2 = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=es-AR&query=${q}&page=1`
      const res2 = await fetch(url2)
      if (!res2.ok) return null
      const data2 = await res2.json()
      return data2.results?.[0] ?? null
    }
    return first
  } catch { return null }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ImportarPage() {
  const router = useRouter()
  const supabase = useRef(createClient()).current

  const [files, setFiles] = useState<{ [k: string]: File | null }>({
    watched: null, ratings: null, watchlist: null, reviews: null,
  })
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [phase, setPhase] = useState<'idle' | 'processing' | 'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const FILE_TYPES = [
    { key: 'watched',   label: 'watched.csv',   icon: <Film size={16} />,     desc: 'Películas vistas' },
    { key: 'ratings',   label: 'ratings.csv',   icon: <Star size={16} />,     desc: 'Calificaciones' },
    { key: 'watchlist', label: 'watchlist.csv',  icon: <Bookmark size={16} />, desc: 'Lista para ver' },
    { key: 'reviews',   label: 'reviews.csv',    icon: <FileText size={16} />, desc: 'Reseñas escritas' },
  ]

  function addLog(msg: string) {
    setLog(prev => [...prev.slice(-99), msg])
    setTimeout(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }) }, 50)
  }

  function handleFile(key: string, file: File) {
    if (!file.name.endsWith('.csv')) return
    setFiles(prev => ({ ...prev, [key]: file }))
  }

  function handleDrop(key: string, e: React.DragEvent) {
    e.preventDefault(); setDragOver(null)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(key, file)
  }

  const hasAnyFile = Object.values(files).some(Boolean)

  async function runImport() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    setPhase('processing')
    setLog([])
    setResult(null)

    // Parse all uploaded files
    const parsed: ParsedFiles = { watched: [], ratings: [], watchlist: [], reviews: [] }
    for (const key of ['watched', 'ratings', 'watchlist', 'reviews'] as const) {
      const file = files[key]
      if (!file) continue
      const text = await file.text()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsed[key] = parseCSV<any>(text)
      addLog(`📄 ${key}.csv: ${parsed[key].length} registros encontrados`)
    }

    const totalItems = parsed.watched.length + parsed.ratings.length + parsed.watchlist.length + parsed.reviews.length
    setTotal(totalItems)
    if (totalItems === 0) { addLog('❌ No se encontraron registros en los archivos.'); setPhase('idle'); return }

    // Deduplicate by title+year — build a TMDB cache to avoid re-searching
    const tmdbCache = new Map<string, { id: number; title: string; poster_path: string | null } | null>()
    const notFound: string[] = []
    let done = 0

    const res: ImportResult = { watchedImported: 0, ratingsImported: 0, watchlistImported: 0, reviewsImported: 0, notFound: [] }

    async function getTmdb(name: string, year: string) {
      const key = `${name}::${year}`
      if (tmdbCache.has(key)) return tmdbCache.get(key)!
      await sleep(250)
      const found = await searchTMDB(name, year)
      tmdbCache.set(key, found)
      return found
    }

    // ── watched ──────────────────────────────────────────────────────────────
    for (const row of parsed.watched) {
      done++; setProgress(done)
      const movie = await getTmdb(row.Name, row.Year)
      if (!movie) { notFound.push(`${row.Name} (${row.Year})`); addLog(`⚠ No encontrada: ${row.Name} (${row.Year})`); continue }
      const { error } = await supabase.from('watched').upsert({
        user_id: user.id, media_id: movie.id, media_type: 'movie',
        title: movie.title ?? row.Name, poster_path: movie.poster_path ?? null,
        watched_at: row.Date ? new Date(row.Date).toISOString() : new Date().toISOString(),
      }, { onConflict: 'user_id,media_id,media_type' })
      if (!error) { res.watchedImported++; addLog(`✓ Visto: ${movie.title ?? row.Name}`) }
    }

    // ── ratings ───────────────────────────────────────────────────────────────
    for (const row of parsed.ratings) {
      if (!row.Rating) continue
      done++; setProgress(done)
      const movie = await getTmdb(row.Name, row.Year)
      if (!movie) { notFound.push(`${row.Name} (${row.Year})`); continue }
      const rating = Math.max(0.5, Math.min(5, parseFloat(row.Rating)))
      if (isNaN(rating)) continue
      const { error } = await supabase.from('ratings').upsert({
        user_id: user.id, media_id: movie.id, media_type: 'movie',
        title: movie.title ?? row.Name, poster_path: movie.poster_path ?? null,
        rating, rated_at: row.Date ? new Date(row.Date).toISOString() : new Date().toISOString(),
      }, { onConflict: 'user_id,media_id,media_type' })
      if (!error) { res.ratingsImported++; addLog(`★ Calificada: ${movie.title ?? row.Name} — ${rating}/5`) }
    }

    // ── watchlist ─────────────────────────────────────────────────────────────
    for (const row of parsed.watchlist) {
      done++; setProgress(done)
      const movie = await getTmdb(row.Name, row.Year)
      if (!movie) { notFound.push(`${row.Name} (${row.Year})`); continue }
      const { error } = await supabase.from('watchlist').upsert({
        user_id: user.id, media_id: movie.id, media_type: 'movie',
        title: movie.title ?? row.Name, poster_path: movie.poster_path ?? null,
        added_at: row.Date ? new Date(row.Date).toISOString() : new Date().toISOString(),
      }, { onConflict: 'user_id,media_id,media_type' })
      if (!error) { res.watchlistImported++; addLog(`🔖 Watchlist: ${movie.title ?? row.Name}`) }
    }

    // ── reviews ───────────────────────────────────────────────────────────────
    for (const row of parsed.reviews) {
      if (!row.Review?.trim()) continue
      done++; setProgress(done)
      const movie = await getTmdb(row.Name, row.Year)
      if (!movie) { notFound.push(`${row.Name} (${row.Year})`); continue }
      const rating = row.Rating ? Math.max(0.5, Math.min(5, parseFloat(row.Rating))) : null
      const { error } = await supabase.from('reviews').upsert({
        user_id: user.id, media_id: movie.id, media_type: 'movie',
        title: movie.title ?? row.Name, poster_path: movie.poster_path ?? null,
        body: row.Review.trim(), rating: isNaN(rating ?? NaN) ? null : rating,
        recommended: true, has_spoiler: false,
        created_at: row.Date ? new Date(row.Date).toISOString() : new Date().toISOString(),
      }, { onConflict: 'user_id,media_id,media_type' })
      if (!error) { res.reviewsImported++; addLog(`✍ Reseña importada: ${movie.title ?? row.Name}`) }
    }

    res.notFound = [...new Set(notFound)]
    setResult(res)
    setPhase('done')
    addLog('🎉 Importación completada.')
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <Link href="/profile" className="text-xs text-[#A0A0B0] hover:text-white mb-4 inline-flex items-center gap-1 transition-colors">
            ← Volver al perfil
          </Link>
          <h1 className="text-3xl font-bold text-white mt-2 mb-2 flex items-center gap-3">
            <span className="text-4xl">📥</span> Importar desde Letterboxd
          </h1>
          <p className="text-[#A0A0B0]">Traé tu historial completo de Letterboxd a Glynbox en pocos minutos.</p>
        </div>

        {/* Instructions */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#FFFD02] mb-4">Cómo exportar tus datos de Letterboxd</h2>
          <ol className="space-y-3">
            {[
              { n: 1, text: 'Entrá a', link: 'letterboxd.com → Settings → Data', note: 'O directo: letterboxd.com/[tuusuario]/settings/data' },
              { n: 2, text: 'Hacé clic en "Export Your Data"', note: 'Letterboxd te manda un email con un link de descarga' },
              { n: 3, text: 'Descargá el ZIP y descomprimilo', note: 'Vas a ver varios archivos .csv adentro' },
              { n: 4, text: 'Subí los archivos acá abajo', note: 'Podés subir uno o varios a la vez' },
            ].map(step => (
              <li key={step.n} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-black shrink-0 mt-0.5" style={{ backgroundColor: '#FFFD02' }}>{step.n}</span>
                <div>
                  <p className="text-sm text-white">{step.text}</p>
                  <p className="text-xs text-[#A0A0B0] mt-0.5">{step.note}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Upload zones */}
        {phase === 'idle' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {FILE_TYPES.map(({ key, label, icon, desc }) => {
                const file = files[key]
                return (
                  <label
                    key={key}
                    onDragOver={e => { e.preventDefault(); setDragOver(key) }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => handleDrop(key, e)}
                    className={`relative flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                      dragOver === key
                        ? 'border-[#FFFD02] bg-[#FFFD02]/5'
                        : file
                        ? 'border-[#22c55e]/60 bg-[#22c55e]/5'
                        : 'border-[#2A2A3A] hover:border-zinc-600 bg-[#13131A]'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".csv"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={e => { if (e.target.files?.[0]) handleFile(key, e.target.files[0]) }}
                    />
                    <div className={file ? 'text-[#22c55e]' : 'text-[#A0A0B0]'}>
                      {file ? <CheckCircle size={22} /> : icon}
                    </div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-[#A0A0B0]">{file ? `✓ ${file.name}` : desc}</p>
                  </label>
                )
              })}
            </div>

            <button
              onClick={runImport}
              disabled={!hasAnyFile}
              className="w-full py-4 rounded-full text-black font-bold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: '#FFFD02' }}
            >
              <Upload size={18} />
              Importar datos
            </button>
            <p className="text-xs text-[#A0A0B0] text-center mt-3">Los datos se agregan sin sobreescribir los que ya tenés en Glynbox.</p>
          </>
        )}

        {/* Progress */}
        {phase === 'processing' && (
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 size={20} className="animate-spin text-[#FFFD02] shrink-0" />
              <p className="text-white font-semibold">
                Procesando {progress} de {total} títulos…
              </p>
            </div>
            {total > 0 && (
              <div className="h-2 bg-[#1C1C27] rounded-full overflow-hidden mb-5">
                <div
                  className="h-full bg-[#FFFD02] rounded-full transition-all duration-300"
                  style={{ width: `${(progress / total) * 100}%` }}
                />
              </div>
            )}
            <div
              ref={logRef}
              className="bg-[#0A0A0F] rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs space-y-1"
            >
              {log.map((l, i) => (
                <p key={i} className="text-zinc-400 leading-relaxed">{l}</p>
              ))}
            </div>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && result && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="bg-[#13131A] border border-[#22c55e]/30 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <CheckCircle size={22} className="text-[#22c55e]" />
                <h2 className="text-lg font-bold text-white">Importación completada</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: <Film size={16} />, label: 'Películas vistas', value: result.watchedImported, color: '#FFFD02' },
                  { icon: <Star size={16} />, label: 'Calificaciones', value: result.ratingsImported, color: '#F5A623' },
                  { icon: <Bookmark size={16} />, label: 'Watchlist', value: result.watchlistImported, color: '#60a5fa' },
                  { icon: <FileText size={16} />, label: 'Reseñas', value: result.reviewsImported, color: '#a78bfa' },
                ].map(s => (
                  <div key={s.label} className="bg-[#0A0A0F] rounded-xl p-4 text-center">
                    <div className="flex justify-center mb-2" style={{ color: s.color }}>{s.icon}</div>
                    <p className="text-2xl font-bold text-white">{s.value}</p>
                    <p className="text-xs text-[#A0A0B0] mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Not found */}
            {result.notFound.length > 0 && (
              <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle size={16} className="text-amber-400 shrink-0" />
                  <p className="text-sm font-semibold text-white">{result.notFound.length} título{result.notFound.length !== 1 ? 's' : ''} no encontrado{result.notFound.length !== 1 ? 's' : ''} en TMDB</p>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {result.notFound.map((t, i) => (
                    <p key={i} className="text-xs text-[#A0A0B0]">• {t}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Log */}
            <div
              ref={logRef}
              className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4 h-40 overflow-y-auto font-mono text-xs space-y-1"
            >
              {log.map((l, i) => <p key={i} className="text-zinc-500 leading-relaxed">{l}</p>)}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Link href="/profile" className="flex-1 py-3 rounded-full text-black font-bold text-sm text-center transition-colors flex items-center justify-center gap-2" style={{ backgroundColor: '#FFFD02' }}>
                Ver mi perfil <ChevronRight size={16} />
              </Link>
              <button
                onClick={() => { setPhase('idle'); setFiles({ watched: null, ratings: null, watchlist: null, reviews: null }); setLog([]); setResult(null) }}
                className="px-5 py-3 rounded-full text-[#A0A0B0] hover:text-white border border-[#2A2A3A] hover:border-zinc-500 text-sm transition-colors"
              >
                Importar más
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
