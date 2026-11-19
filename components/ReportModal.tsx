'use client'

import { useState } from 'react'
import { X, Flag } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useIdioma } from '@/components/useIdioma'

const REPORT_REASONS = [
  'Spam o publicidad',
  'Acoso o lenguaje violento',
  'Contenido sexual o desnudez',
  'Información falsa o engañosa',
  'Discurso de odio',
  'Spoilers sin advertencia',
  'Otro',
]

/** Lo que se ve en inglés. En la base se guarda siempre el motivo en castellano. */
const REPORT_REASONS_EN: Record<string, string> = {
  'Spam o publicidad': 'Spam or advertising',
  'Acoso o lenguaje violento': 'Harassment or violent language',
  'Contenido sexual o desnudez': 'Sexual content or nudity',
  'Información falsa o engañosa': 'False or misleading information',
  'Discurso de odio': 'Hate speech',
  'Spoilers sin advertencia': 'Unmarked spoilers',
  'Otro': 'Other',
}

const STORAGE_KEY = 'glynbox_reported_content'

function getReportedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch { /* ignore */ }
  return new Set()
}

function markReported(contentId: string) {
  try {
    const s = getReportedSet()
    s.add(contentId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]))
  } catch { /* ignore */ }
}

/**
 * Qué se reporta. `comment` es un comentario de reseña (así quedó de antes);
 * los de listas y guías tienen el suyo, para que `/admin/reportes` sepa de qué
 * tabla borrarlos.
 */
export type ContenidoReportable = 'review' | 'comment' | 'list_comment' | 'guide_comment'

interface ReportModalProps {
  contentType: ContenidoReportable
  contentId: string
  contentAuthorId: string
  isOpen: boolean
  onClose: () => void
}

export default function ReportModal({
  contentType, contentId, contentAuthorId, isOpen, onClose,
}: ReportModalProps) {
  const supabase = createClient()
  const en = useIdioma() === 'en'
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alreadyReported =
    typeof window !== 'undefined' && getReportedSet().has(contentId)

  async function handleSubmit() {
    if (!reason || submitting) return
    setSubmitting(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: insertError } = await supabase.from('content_reports').insert({
      reporter_id: user?.id ?? null,
      content_type: contentType,
      content_id: contentId,
      content_author_id: contentAuthorId,
      reason,
      detail: detail.trim() || null,
    })
    if (insertError) {
      setError(en ? "Couldn't send the report. Please try again." : 'No se pudo enviar el reporte. Intentá de nuevo.')
      setSubmitting(false)
      return
    }
    markReported(contentId)
    setDone(true)
    setTimeout(() => { setDone(false); setReason(''); setDetail(''); onClose() }, 1800)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A3A]">
          <div className="flex items-center gap-2">
            <Flag size={14} className="text-[#A0A0B0]" />
            <p className="text-sm font-semibold text-white">
              {en
                ? (contentType === 'review' ? 'Report review' : 'Report comment')
                : <>Reportar {contentType === 'review' ? 'reseña' : 'comentario'}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-[#A0A0B0] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {done ? (
            <div className="text-center py-4">
              <p className="text-green-400 font-semibold text-sm">{en ? 'Report sent' : 'Reporte enviado'}</p>
              <p className="text-[#A0A0B0] text-xs mt-1">{en ? 'Thanks for helping us keep the community safe.' : 'Gracias por ayudarnos a mantener la comunidad.'}</p>
            </div>
          ) : alreadyReported ? (
            <div className="text-center py-4">
              <p className="text-[#A0A0B0] text-sm">{en ? "You've already reported this content." : 'Ya reportaste este contenido anteriormente.'}</p>
              <button onClick={onClose} className="mt-3 text-xs text-zinc-500 hover:text-white transition-colors">{en ? 'Close' : 'Cerrar'}</button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <p className="text-xs text-[#A0A0B0]">{en ? 'Why are you reporting this?' : '¿Por qué estás reportando esto?'}</p>
                {REPORT_REASONS.map(r => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`w-full text-left text-sm px-3 py-2.5 rounded-lg border transition-colors ${
                      reason === r
                        ? 'border-[#FFFD02]/50 bg-[#FFFD02]/10 text-white'
                        : 'border-[#2A2A3A] text-zinc-300 hover:bg-[#1C1C27] hover:text-white'
                    }`}
                  >
                    {en ? REPORT_REASONS_EN[r] ?? r : r}
                  </button>
                ))}
              </div>

              {reason === 'Otro' && (
                <textarea
                  value={detail}
                  onChange={e => setDetail(e.target.value)}
                  placeholder={en ? 'Tell us more (optional)...' : 'Contanos más (opcional)...'}
                  rows={3}
                  maxLength={500}
                  className="w-full bg-[#1C1C27] border border-[#2A2A3A] text-white text-sm rounded-lg px-3 py-2 outline-none placeholder-zinc-600 focus:ring-1 focus:ring-[#FFFD02] resize-none"
                />
              )}

              {error && (
                <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg border border-[#2A2A3A] text-sm text-zinc-300 hover:text-white transition-colors"
                >
                  {en ? 'Cancel' : 'Cancelar'}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!reason || submitting}
                  className="flex-1 py-2.5 rounded-lg bg-[#FFFD02] hover:bg-[#E5EB00] text-black text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {en ? (submitting ? 'Sending...' : 'Send report') : submitting ? 'Enviando...' : 'Enviar reporte'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
