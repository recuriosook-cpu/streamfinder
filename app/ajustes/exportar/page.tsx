'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, FileJson, FileText } from 'lucide-react'

export default function ExportarPage() {
  const [jsonLoading, setJsonLoading] = useState(false)
  const [csvLoading,  setCsvLoading]  = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function downloadFile(format: 'json' | 'csv') {
    const set = format === 'json' ? setJsonLoading : setCsvLoading
    set(true)
    setError(null)
    try {
      const res = await fetch(`/api/export-data?format=${format}`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      const blob = await res.blob()
      const contentDisposition = res.headers.get('Content-Disposition') ?? ''
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/)
      const filename = filenameMatch?.[1] ?? (format === 'json' ? 'glynbox-export.json' : 'glynbox-letterboxd.zip')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      set(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        <div className="flex items-center gap-3">
          <Link href="/ajustes" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-white">Exportar mis datos</h1>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {/* JSON export */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <FileJson size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Exportar todo (JSON)</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Descarga un archivo JSON con todos tus datos: perfil, películas vistas,
                watchlist, favoritos, calificaciones, reseñas, listas, actores seguidos
                y preferencias de notificaciones.
              </p>
            </div>
          </div>
          <button
            onClick={() => downloadFile('json')}
            disabled={jsonLoading || csvLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {jsonLoading ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Preparando...</>
            ) : (
              <><Download size={14} /> Descargar JSON</>
            )}
          </button>
        </div>

        {/* CSV / Letterboxd export */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFFD02]/10 flex items-center justify-center shrink-0">
              <FileText size={20} className="text-[#FFFD02]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Exportar para Letterboxd (CSV)</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Descarga un archivo ZIP con 4 CSVs compatibles con el formato de importación
                de Letterboxd: <span className="text-zinc-400">watched.csv</span>,{' '}
                <span className="text-zinc-400">ratings.csv</span>,{' '}
                <span className="text-zinc-400">watchlist.csv</span> y{' '}
                <span className="text-zinc-400">reviews.csv</span>.
              </p>
            </div>
          </div>
          <button
            onClick={() => downloadFile('csv')}
            disabled={jsonLoading || csvLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#FFFD02] hover:bg-[#E5EB00] text-black text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {csvLoading ? (
              <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Preparando...</>
            ) : (
              <><Download size={14} /> Descargar ZIP para Letterboxd</>
            )}
          </button>
        </div>

        <p className="text-xs text-zinc-600 text-center">
          Los datos exportados son solo tuyos. Glynbox no comparte tu información con terceros.
        </p>
      </div>
    </div>
  )
}
