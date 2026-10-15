'use client'

import { useState } from 'react'
import { AlertCircle, Bell, Check, FlaskConical, Loader2, Send } from 'lucide-react'
import type { EnvioPush, NotificarEstado } from '@/app/api/admin/recomendaciones/notificar/route'
import type { RecomendacionAdmin } from '@/app/api/admin/recomendaciones/route'

/**
 * El envío de "Ferlage te recomienda ver" y su historial.
 *
 * El servidor (`/api/admin/recomendaciones/notificar`) es el que hace cumplir
 * el límite de 3 por semana; acá sólo se muestra y se deshabilita el botón.
 * Todo envío real pasa por una confirmación con la cantidad de aparatos.
 */

export const TITULO_PUSH = 'Ferlage te recomienda ver'

type Respuesta = {
  id: number
  prueba: boolean
  cuerpo: string
  destinatarios: number
  enviados: number
  fallidos: number
  tokensBorrados: number
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

const dia = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' })

function titulo(r: RecomendacionAdmin) {
  return r.title ?? `${r.mediaType === 'movie' ? 'Película' : 'Serie'} ${r.tmdbId}`
}

export function EnviarNotificacion({
  item,
  estado,
  onEnviado,
}: {
  item: RecomendacionAdmin
  estado: NotificarEstado | null
  /** Para que la página recargue el contador y el historial. */
  onEnviado: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState<'real' | 'prueba' | null>(null)
  const [hecho, setHecho] = useState<Respuesta | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!estado) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#A0A0B0]">
        <Loader2 size={13} className="animate-spin" /> Contando aparatos…
      </div>
    )
  }

  if (!estado.disponible) {
    return (
      <p className="text-xs text-amber-300">
        Falta correr <code className="text-amber-200">supabase-push-envios-2026-10.sql</code> en el SQL Editor de
        Supabase para poder mandar notificaciones.
      </p>
    )
  }

  const agotado = estado.usadosSemana >= estado.limite
  const yaEnviada = hecho !== null && !hecho.prueba

  async function enviar(prueba: boolean) {
    setEnviando(prueba ? 'prueba' : 'real')
    setError(null)
    try {
      const res = await fetch('/api/admin/recomendaciones/notificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recomendacionId: item.id, prueba }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const libre = data.proximoLibre ? ` El próximo se libera el ${dia(data.proximoLibre)}.` : ''
        throw new Error((data.message ?? `Error ${res.status}`) + libre)
      }
      setHecho(data as Respuesta)
      onEnviado()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar.')
    } finally {
      setEnviando(null)
      setConfirmando(false)
    }
  }

  return (
    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Bell size={16} className="text-[#FFFD02] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{TITULO_PUSH}</p>
          <p className="text-sm text-zinc-300">{titulo(item)}</p>
          <p className="text-[11px] text-[#A0A0B0] mt-1">
            Al tocarla abre la ficha en la app. Le llega a{' '}
            <span className="text-white font-semibold">{estado.aparatos}</span>{' '}
            {estado.aparatos === 1 ? 'aparato' : 'aparatos'} con notificaciones activadas.
            {' '}Esta semana: <span className="text-white font-semibold">{estado.usadosSemana} de {estado.limite}</span>.
          </p>
        </div>
      </div>

      {agotado && !yaEnviada && (
        <p className="text-xs text-amber-300 flex items-start gap-1.5">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          Ya mandaste {estado.limite} en los últimos 7 días.
          {estado.proximoLibre && <> El próximo se libera el {dia(estado.proximoLibre)}.</>}
        </p>
      )}

      {hecho && (
        <p className={`text-xs flex items-start gap-1.5 ${hecho.prueba ? 'text-sky-300' : 'text-emerald-300'}`}>
          <Check size={13} className="shrink-0 mt-0.5" />
          {hecho.prueba ? 'Prueba enviada' : 'Enviada'}: {hecho.enviados} de {hecho.destinatarios} aceptadas por Expo
          {hecho.fallidos > 0 && <>, {hecho.fallidos} fallaron</>}
          {hecho.tokensBorrados > 0 && <>, {hecho.tokensBorrados} tokens borrados</>}.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-300 flex items-start gap-1.5">
          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {confirmando ? (
        <div className="rounded-lg border border-[#FFFD02]/30 bg-[#FFFD02]/5 p-3 space-y-2.5">
          <p className="text-sm text-white">
            ¿Mandar la notificación a <span className="font-bold">{estado.aparatos}</span>{' '}
            {estado.aparatos === 1 ? 'aparato' : 'aparatos'}? No se puede deshacer, y usa
            {' '}{estado.usadosSemana + 1} de {estado.limite} de esta semana.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void enviar(false)}
              disabled={enviando !== null}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#FFFD02] text-black text-sm font-semibold disabled:opacity-40"
            >
              {enviando === 'real' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Sí, enviar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={enviando !== null}
              className="px-3.5 py-2 rounded-lg text-sm text-zinc-400 hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={agotado || yaEnviada || estado.aparatos === 0 || enviando !== null}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#FFFD02] text-black text-sm font-semibold disabled:opacity-40"
          >
            <Send size={14} />
            {yaEnviada ? 'Enviada' : `Enviar a ${estado.aparatos} ${estado.aparatos === 1 ? 'aparato' : 'aparatos'}`}
          </button>
          <button
            type="button"
            onClick={() => void enviar(true)}
            disabled={estado.aparatosPrueba === 0 || enviando !== null}
            title={estado.aparatosPrueba === 0 ? 'Tu usuario no tiene aparatos con notificaciones activadas' : undefined}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#2A2A3A] text-sm text-zinc-300 hover:text-white disabled:opacity-40"
          >
            {enviando === 'prueba' ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
            Enviarme una de prueba
            <span className="text-[11px] text-zinc-500">
              ({estado.aparatosPrueba} {estado.aparatosPrueba === 1 ? 'aparato' : 'aparatos'})
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

export function HistorialEnvios({ estado }: { estado: NotificarEstado | null }) {
  if (!estado || !estado.disponible) return null

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-white">Notificaciones enviadas</p>
        <p className="text-xs text-[#A0A0B0]">
          Esta semana: <span className="text-white font-semibold">{estado.usadosSemana} de {estado.limite}</span>
          {estado.proximoLibre && <> · próximo libre el {dia(estado.proximoLibre)}</>}
        </p>
      </div>

      {estado.historial.length === 0 ? (
        <p className="text-sm text-[#A0A0B0] py-4">Todavía no se mandó ninguna.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
                <th className="text-left font-medium py-2 pr-3">Título</th>
                <th className="text-left font-medium py-2 px-2">Fecha</th>
                <th className="text-right font-medium py-2 px-2">Enviadas</th>
                <th className="text-right font-medium py-2 px-2">Fallaron</th>
                <th className="text-right font-medium py-2 px-2">Abiertas</th>
              </tr>
            </thead>
            <tbody>
              {estado.historial.map((e: EnvioPush) => (
                <tr key={e.id} className="border-b border-[#2A2A3A]/60 last:border-0">
                  <td className="py-2 pr-3 text-white">
                    <a href={`/${e.mediaType}/${e.tmdbId}`} target="_blank" className="hover:underline">{e.cuerpo}</a>
                    {e.prueba && (
                      <span className="ml-2 text-[10px] font-semibold text-sky-300 bg-sky-900/40 rounded px-1.5 py-0.5">PRUEBA</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-zinc-400 tabular-nums whitespace-nowrap">{fecha(e.creadoEn)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">
                    {e.enviados ?? '—'}<span className="text-zinc-600"> / {e.destinatarios}</span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">
                    {e.fallidos ?? '—'}
                    {e.tokensBorrados > 0 && (
                      <span className="block text-[10px] text-zinc-500">{e.tokensBorrados} tokens borrados</span>
                    )}
                    {e.recibosPendientes && (
                      <span className="block text-[10px] text-zinc-500">recibos pendientes</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{e.abiertas}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-[#A0A0B0] mt-3 leading-relaxed">
            Enviadas = aceptadas por Expo, menos las que el recibo dio por fallidas (se revisa a los 15 minutos, al
            abrir esta página). Los tokens de gente que desinstaló se borran solos. Abiertas cuenta instalaciones que
            tocaron la notificación, sólo desde la versión de la app que manda ese dato.
          </p>
        </div>
      )}
    </section>
  )
}
