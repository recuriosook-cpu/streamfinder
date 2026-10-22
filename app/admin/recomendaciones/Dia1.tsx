'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, Check, Clock, FlaskConical, Loader2 } from 'lucide-react'
import type { Dia1Estado, EnvioDia1, ResultadoPruebaDia1 } from '@/app/api/admin/dia1/route'

/**
 * "Para esta noche", la push del día 1: la prueba y el historial.
 *
 * Los envíos reales los hace sólo `/api/cron/push-dia1`, que pg_cron llama
 * cada hora desde Supabase. El botón de acá arma la que le tocaría a quien
 * está en el panel y se la manda sólo a él, sin mirar si es nuevo ni la hora.
 */

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

const porcentaje = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)} %` : '—')

export function Dia1({ recargar }: { recargar: number }) {
  const [estado, setEstado] = useState<Dia1Estado | null>(null)
  const [probando, setProbando] = useState(false)
  const [prueba, setPrueba] = useState<ResultadoPruebaDia1 | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    try {
      const res = await fetch('/api/admin/dia1', { cache: 'no-store' })
      if (res.ok) setEstado(await res.json())
    } catch { /* se reintenta al refrescar la página */ }
  }

  useEffect(() => { void cargar() }, [recargar])

  async function probar() {
    setProbando(true)
    setError(null)
    setPrueba(null)
    try {
      const res = await fetch('/api/admin/dia1', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? `Error ${res.status}`)
      setPrueba(data as ResultadoPruebaDia1)
      void cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar la prueba.')
    } finally {
      setProbando(false)
    }
  }

  const t = estado?.totales

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-white">Para esta noche (día 1)</p>
        <p className="text-xs text-[#A0A0B0] flex items-center gap-1.5">
          <Clock size={13} /> A las 20 de cada país, revisando cada hora
        </p>
      </div>

      <p className="text-xs text-[#A0A0B0] leading-relaxed">
        Una sola vez, a cada cuenta nueva con la app y notificaciones activadas, el día siguiente de
        registrarse: una recomendación de algo que calificó alto, que esté en sus plataformas. No le llega si
        ese día ya abrió la app o la web, si apagó &quot;Tu resumen semanal&quot;, si en los últimos 7 días ya
        recibió 3 notificaciones o si nada encaja.
      </p>

      {estado && !estado.disponible && (
        <p className="text-xs text-amber-300">
          Falta correr <code className="text-amber-200">supabase-push-dia1-2026-10.sql</code> en el SQL Editor de
          Supabase. Sin eso no sale ninguna.
        </p>
      )}

      {estado?.disponible && t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[
            { etiqueta: 'Personas', valor: t.personas },
            { etiqueta: 'Enviadas', valor: t.enviados },
            { etiqueta: 'Fallaron', valor: t.fallidos },
            { etiqueta: 'Abiertas', valor: `${t.abiertas} (${porcentaje(t.abiertas, t.enviados)})` },
          ].map(c => (
            <div key={c.etiqueta} className="rounded-lg bg-[#0A0A0F] border border-[#2A2A3A] py-2">
              <p className="text-base font-bold text-white tabular-nums">{c.valor}</p>
              <p className="text-[10px] uppercase tracking-wide text-[#A0A0B0]">{c.etiqueta}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => void probar()}
          disabled={probando || !estado?.disponible}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#2A2A3A] text-sm text-zinc-300 hover:text-white disabled:opacity-40"
        >
          {probando ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
          Enviarme la del día 1 de prueba
        </button>

        {prueba && (
          <div className="rounded-lg border border-[#2A2A3A] bg-[#0A0A0F] p-3 space-y-1.5 text-xs">
            {prueba.eleccion && (
              <p className="text-white">
                <span className="text-[#A0A0B0]">Te toca:</span>{' '}
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
                <th className="text-left font-medium py-2 pr-3">Envío</th>
                <th className="text-left font-medium py-2 px-2">Fecha</th>
                <th className="text-right font-medium py-2 px-2">Enviadas</th>
                <th className="text-right font-medium py-2 px-2">Fallaron</th>
                <th className="text-right font-medium py-2 px-2">Abiertas</th>
              </tr>
            </thead>
            <tbody>
              {estado.historial.map((e: EnvioDia1) => (
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
            Cada fila es una corrida que mandó algo (las que no tenían a nadie no dejan fila). Enviadas y fallidas
            cuentan aparatos; abiertas, instalaciones que tocaron la notificación. Personas cuenta a todos los que
            recibieron la del día 1 alguna vez.
          </p>
        </div>
      )}
    </section>
  )
}
