'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, CalendarClock, Check, FlaskConical, Loader2 } from 'lucide-react'
import type { CorridaSemanal, ResultadoPrueba, SemanalEstado } from '@/app/api/admin/semanal/route'

/**
 * "Tu resumen semanal": cuándo corre, la prueba y el historial.
 *
 * La corrida real la hace sólo el cron de los viernes
 * (`/api/cron/resumen-semanal`). El botón de acá arma la que le tocaría a
 * quien está en el panel y se la manda sólo a él; no reserva el título.
 */

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

const proxima = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })

export function ResumenSemanal({ recargar }: { recargar: number }) {
  const [estado, setEstado] = useState<SemanalEstado | null>(null)
  const [probando, setProbando] = useState(false)
  const [prueba, setPrueba] = useState<ResultadoPrueba | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    try {
      const res = await fetch('/api/admin/semanal', { cache: 'no-store' })
      if (res.ok) setEstado(await res.json())
    } catch { /* se reintenta al refrescar la página */ }
  }

  useEffect(() => { void cargar() }, [recargar])

  async function probar() {
    setProbando(true)
    setError(null)
    setPrueba(null)
    try {
      const res = await fetch('/api/admin/semanal', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? `Error ${res.status}`)
      setPrueba(data as ResultadoPrueba)
      void cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar la prueba.')
    } finally {
      setProbando(false)
    }
  }

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-white">Tu resumen semanal</p>
        {estado && (
          <p className="text-xs text-[#A0A0B0] flex items-center gap-1.5">
            <CalendarClock size={13} />
            Próxima: <span className="text-white font-semibold">{proxima(estado.proximaCorrida)}</span>
          </p>
        )}
      </div>

      <p className="text-xs text-[#A0A0B0] leading-relaxed">
        Una por persona con la app y notificaciones activadas: algo de su watchlist que ya esté en sus
        plataformas, o si no un estreno de sus plataformas que encaje con sus géneros y lo que calificó alto.
        Si nada encaja, o si en los últimos 7 días ya recibió 3 notificaciones, esa semana no le llega.
      </p>

      {estado && !estado.disponible && (
        <p className="text-xs text-amber-300">
          Falta correr <code className="text-amber-200">supabase-push-semanal-2026-10.sql</code> en el SQL Editor de
          Supabase. Sin eso, el viernes no sale nada.
        </p>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => void probar()}
          disabled={probando || !estado?.disponible}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#2A2A3A] text-sm text-zinc-300 hover:text-white disabled:opacity-40"
        >
          {probando ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
          Enviarme la semanal de prueba
        </button>

        {prueba && (
          <div className="rounded-lg border border-[#2A2A3A] bg-[#0A0A0F] p-3 space-y-1.5 text-xs">
            {prueba.eleccion && (
              <p className="text-white">
                <span className="text-[#A0A0B0]">Te toca ({prueba.eleccion.motivo === 'watchlist' ? 'de tu watchlist' : 'estreno'}):</span>{' '}
                <a href={prueba.eleccion.url} target="_blank" className="hover:underline">{prueba.eleccion.cuerpo}</a>
              </p>
            )}
            {prueba.envioId !== null ? (
              <p className="text-sky-300 flex items-start gap-1.5">
                <Check size={13} className="shrink-0 mt-0.5" />
                Prueba enviada: {prueba.enviados} de {prueba.destinatarios} aceptadas por Expo
                {prueba.fallidos > 0 && <>, {prueba.fallidos} fallaron</>}.
              </p>
            ) : prueba.sinEleccion && (
              <p className="text-amber-300 flex items-start gap-1.5">
                <AlertCircle size={13} className="shrink-0 mt-0.5" /> {prueba.sinEleccion}
              </p>
            )}
            {prueba.avisos.map(a => (
              <p key={a} className="text-amber-300 flex items-start gap-1.5">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {a}
              </p>
            ))}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-300 flex items-start gap-1.5">
            <AlertCircle size={13} className="shrink-0 mt-0.5" /> {error}
          </p>
        )}
      </div>

      {estado?.disponible && estado.historial.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
                <th className="text-left font-medium py-2 pr-3">Corrida</th>
                <th className="text-left font-medium py-2 px-2">Fecha</th>
                <th className="text-right font-medium py-2 px-2">Enviadas</th>
                <th className="text-right font-medium py-2 px-2">Fallaron</th>
                <th className="text-right font-medium py-2 px-2">Abiertas</th>
              </tr>
            </thead>
            <tbody>
              {estado.historial.map((e: CorridaSemanal) => (
                <tr key={e.id} className="border-b border-[#2A2A3A]/60 last:border-0">
                  <td className="py-2 pr-3 text-white">
                    {e.mediaType && e.tmdbId
                      ? <a href={`/${e.mediaType}/${e.tmdbId}`} target="_blank" className="hover:underline">{e.cuerpo}</a>
                      : e.cuerpo}
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
            Enviadas y fallidas cuentan aparatos, como en las recomendaciones. Abiertas cuenta instalaciones que
            tocaron la notificación.
          </p>
        </div>
      )}
    </section>
  )
}
