'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Flag, Trash2, X, Ban, ExternalLink,
  Loader2, AlertCircle, Check,
} from 'lucide-react'

type ReportStatus = 'pending' | 'resolved' | 'dismissed'

interface Report {
  id: string
  content_type: 'review' | 'comment'
  content_id: string
  content_author_id: string
  reason: string
  detail: string | null
  created_at: string
  reporter_id: string | null
  status: ReportStatus
  reporter?: { username: string | null; display_name: string | null } | null
  author?:   { username: string | null; display_name: string | null } | null
  contentPreview?: string | null
  reviewId?: string | null
}

export default function AdminReportesPage() {
  const supabase = useRef(createClient()).current

  const [loading,      setLoading]      = useState(false)
  const [reports,      setReports]      = useState<Report[]>([])
  const [statusFilter, setStatusFilter] = useState<ReportStatus>('pending')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [banConfirm,   setBanConfirm]   = useState<{ reportId: string; userId: string; username: string } | null>(null)

  useEffect(() => { fetchReports() }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchReports() {
    setLoading(true)
    setFetchError(null)

    const { data: rawReports, error } = await supabase
      .from('content_reports')
      .select('*')
      .eq('status', statusFilter)
      .order('created_at', { ascending: false })

    if (error) { setFetchError(error.message); setLoading(false); return }
    if (!rawReports?.length) { setReports([]); setLoading(false); return }

    const profileIds = [
      ...new Set([
        ...rawReports.map((r: Report) => r.reporter_id).filter(Boolean),
        ...rawReports.map((r: Report) => r.content_author_id),
      ]),
    ] as string[]

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .in('id', profileIds)
    const profileMap = Object.fromEntries(
      (profiles ?? []).map((p: { id: string; username: string | null; display_name: string | null }) => [p.id, p])
    )

    const reviewIds  = rawReports.filter((r: Report) => r.content_type === 'review').map((r: Report) => r.content_id)
    const commentIds = rawReports.filter((r: Report) => r.content_type === 'comment').map((r: Report) => r.content_id)

    type ReviewRow  = { id: string; body: string | null }
    type CommentRow = { id: string; content: string; review_id: string }

    let reviewMap:  Record<string, ReviewRow>  = {}
    let commentMap: Record<string, CommentRow> = {}

    if (reviewIds.length) {
      const { data } = await supabase.from('reviews').select('id, body').in('id', reviewIds)
      reviewMap = Object.fromEntries((data ?? []).map((r: ReviewRow) => [r.id, r]))
    }
    if (commentIds.length) {
      const { data } = await supabase.from('review_comments').select('id, content, review_id').in('id', commentIds)
      commentMap = Object.fromEntries((data ?? []).map((c: CommentRow) => [c.id, c]))
    }

    const enriched: Report[] = rawReports.map((r: Report) => ({
      ...r,
      reporter:       r.reporter_id ? (profileMap[r.reporter_id] ?? null) : null,
      author:         profileMap[r.content_author_id] ?? null,
      contentPreview: r.content_type === 'review'
        ? (reviewMap[r.content_id]?.body ?? null)
        : (commentMap[r.content_id]?.content ?? null),
      reviewId: r.content_type === 'comment' ? (commentMap[r.content_id]?.review_id ?? null) : null,
    }))

    setReports(enriched)
    setLoading(false)
  }

  async function resolveReport(reportId: string, status: 'resolved' | 'dismissed') {
    setProcessingId(reportId)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('content_reports').update({
      status,
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
    }).eq('id', reportId)

    if (error) {
      toast.error('Error al resolver: ' + error.message)
    } else {
      setReports(prev => prev.filter(r => r.id !== reportId))
      toast.success(status === 'resolved' ? 'Reporte resuelto' : 'Reporte descartado')
    }
    setProcessingId(null)
  }

  async function deleteContent(report: Report) {
    if (!confirm(`¿Eliminar esta ${report.content_type === 'review' ? 'reseña' : 'comentario'}? No se puede deshacer.`)) return
    setProcessingId(report.id)
    const table = report.content_type === 'review' ? 'reviews' : 'review_comments'
    const { error } = await supabase.from(table).delete().eq('id', report.content_id)
    if (error) {
      toast.error('Error al eliminar: ' + error.message)
      setProcessingId(null)
      return
    }
    toast.success('Contenido eliminado')
    await resolveReport(report.id, 'resolved')
  }

  async function handleBanUser(reportId: string, userId: string) {
    setBanConfirm(null)
    setProcessingId(reportId)
    try {
      const res = await fetch('/api/admin/ban-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(`Error al banear: ${body.error ?? 'desconocido'}`)
        setProcessingId(null)
        return
      }
      toast.success('Usuario baneado de Glynbox')
      await resolveReport(reportId, 'resolved')
    } catch {
      toast.error('Error de red al banear usuario')
      setProcessingId(null)
    }
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-6 py-5">
        <h1 className="text-xl font-bold text-white">Reportes</h1>
        <p className="text-sm text-[#A0A0B0] mt-0.5">{reports.length} {statusFilter === 'pending' ? 'pendientes' : statusFilter === 'resolved' ? 'resueltos' : 'descartados'}</p>
      </div>

      {/* Filter tabs */}
      <div className="px-6 py-4 border-b border-[#2A2A3A] bg-[#0D0D14]">
        <div className="flex items-center gap-1 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-1 w-fit">
          {([
            ['pending',   'Pendientes'],
            ['resolved',  'Resueltos'],
            ['dismissed', 'Descartados'],
          ] as const).map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === val ? 'bg-[#FFFD02] text-black' : 'text-[#A0A0B0] hover:text-white'}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-4">

        {fetchError && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{fetchError}</p>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[#FFFD02]" />
          </div>
        )}

        {!loading && reports.length === 0 && (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <Check size={24} className="text-zinc-600" />
            </div>
            <p className="text-white font-medium">
              {statusFilter === 'pending' ? 'Sin reportes pendientes' : 'Sin reportes en esta categoría'}
            </p>
            <p className="text-zinc-600 text-sm mt-1">Todo está en orden.</p>
          </div>
        )}

        {reports.map(report => (
          <div key={report.id} className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl overflow-hidden">

            {/* Report meta */}
            <div className="flex items-start gap-3 px-5 py-4 border-b border-[#2A2A3A]/50">
              <div className={`shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center ${
                report.content_type === 'review' ? 'bg-purple-900/40' : 'bg-blue-900/40'
              }`}>
                <Flag size={13} className={report.content_type === 'review' ? 'text-purple-400' : 'text-blue-400'} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    report.content_type === 'review' ? 'bg-purple-900/40 text-purple-300' : 'bg-blue-900/40 text-blue-300'
                  }`}>
                    {report.content_type === 'review' ? 'Reseña' : 'Comentario'}
                  </span>
                  <span className="text-xs font-semibold text-white">{report.reason}</span>
                </div>

                {report.detail && (
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{report.detail}</p>
                )}

                <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px] text-zinc-600">
                  <span>
                    Reportado por{' '}
                    {report.reporter?.username
                      ? <Link href={`/usuario/${report.reporter.username}`} target="_blank" className="text-zinc-400 hover:text-white transition-colors">@{report.reporter.username}</Link>
                      : 'usuario eliminado'}
                  </span>
                  <span>·</span>
                  <span>
                    Autor:{' '}
                    {report.author?.username
                      ? <Link href={`/usuario/${report.author.username}`} target="_blank" className="text-zinc-400 hover:text-white transition-colors">@{report.author.username}</Link>
                      : 'usuario eliminado'}
                  </span>
                  <span>·</span>
                  <span>{new Date(report.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
            </div>

            {/* Content preview */}
            {report.contentPreview && (
              <div className="px-5 py-3 border-b border-[#2A2A3A]/50 bg-[#0A0A0F]/40">
                <p className="text-[10px] text-zinc-600 mb-1.5 uppercase tracking-wider font-medium">Vista previa</p>
                <p className="text-sm text-zinc-300 line-clamp-4 leading-relaxed">{report.contentPreview}</p>
              </div>
            )}

            {/* Actions */}
            {statusFilter === 'pending' && (
              <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
                <Link
                  href={report.content_type === 'review' ? `/review/${report.content_id}` : `/review/${report.reviewId ?? ''}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#1C1C27] hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors border border-[#2A2A3A]"
                >
                  <ExternalLink size={11} /> Ver contenido
                </Link>

                <button
                  onClick={() => deleteContent(report)}
                  disabled={processingId === report.id}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-400 hover:text-red-300 transition-colors border border-red-900/40 disabled:opacity-50"
                >
                  {processingId === report.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  Eliminar contenido
                </button>

                <button
                  onClick={() => resolveReport(report.id, 'dismissed')}
                  disabled={processingId === report.id}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                >
                  <X size={11} /> Descartar
                </button>

                {report.author?.username && (
                  <button
                    onClick={() => setBanConfirm({ reportId: report.id, userId: report.content_author_id, username: report.author!.username! })}
                    disabled={processingId === report.id}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-red-950/40 text-zinc-600 hover:text-red-400 transition-colors border border-zinc-800 hover:border-red-900/40 disabled:opacity-40 ml-auto"
                  >
                    <Ban size={11} /> Banear de Glynbox
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ban modal */}
      {banConfirm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setBanConfirm(null) }}>
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center shrink-0">
                <Ban size={18} className="text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">¿Banear a @{banConfirm.username}?</p>
                <p className="text-xs text-zinc-500 mt-0.5">El usuario no podrá iniciar sesión. Reversible desde Supabase.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setBanConfirm(null)} className="flex-1 py-2 rounded-lg border border-[#2A2A3A] text-sm text-zinc-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={() => handleBanUser(banConfirm.reportId, banConfirm.userId)} className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-sm text-white font-semibold transition-colors">
                Banear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
