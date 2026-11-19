'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { GrupoMailPrueba, MailPruebaResumen } from '@/app/api/admin/mail-prueba/route'

/**
 * "Prueba mail-1": a 300 usuarios inactivos les llegó un mail y a otros 300
 * (control) no. Cuántos de cada grupo volvieron a entrar en los 7 días
 * siguientes, y cuántos llegaron por un link del mail. Datos de
 * `/api/admin/mail-prueba`.
 */

const numero = (n: number) => n.toLocaleString('es-AR')
const pct = (n: number, de: number) => (de > 0 ? `${Math.round((n / de) * 1000) / 10}%` : '—')
const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' }) : '—'

export function MailPruebaPanel({ recarga = 0 }: { recarga?: number }) {
  const [datos, setDatos] = useState<MailPruebaResumen | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const r = await fetch('/api/admin/mail-prueba', { cache: 'no-store' })
      setDatos(r.ok ? ((await r.json()) as MailPruebaResumen) : null)
    } catch {
      setDatos(null)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar, recarga])

  const mail = datos?.grupos.find(g => g.grupo === 'mail')
  const control = datos?.grupos.find(g => g.grupo === 'control')
  const tasa = (g?: GrupoMailPrueba) => (g && g.conFecha > 0 ? g.volvieron / g.conFecha : null)
  const tMail = tasa(mail)
  const tControl = tasa(control)
  const diferencia = tMail !== null && tControl !== null ? Math.round((tMail - tControl) * 1000) / 10 : null

  const fila = (g: GrupoMailPrueba | undefined, nombre: string) =>
    g && (
      <tr className="border-t border-[#2A2A3A] text-white">
        <td className="py-2 pr-3 font-semibold">{nombre}</td>
        <td className="py-2 text-right">{numero(g.asignados)}</td>
        <td className="py-2 text-right">
          {numero(g.conFecha)}
          {g.ventanaCerrada < g.conFecha && (
            <span className="text-[#A0A0B0]"> ({numero(g.ventanaCerrada)} con 7 días)</span>
          )}
        </td>
        <td className="py-2 text-right">
          {numero(g.volvieron)} <span className="text-[#FFFD02]">{pct(g.volvieron, g.conFecha)}</span>
        </td>
        <td className="py-2 text-right">
          {g.grupo === 'mail' ? <>{numero(g.desdeMail)} <span className="text-[#A0A0B0]">{pct(g.desdeMail, g.conFecha)}</span></> : '—'}
        </td>
        <td className="py-2 text-right">{g.grupo === 'mail' ? numero(g.visitasMail) : '—'}</td>
        <td className="py-2 text-right">{g.grupo === 'mail' ? numero(g.bajas) : '—'}</td>
        <td className="py-2 text-right text-[#A0A0B0]">{g.errores > 0 ? numero(g.errores) : '—'}</td>
      </tr>
    )

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-white mb-1">Prueba mail-1</h2>
      <p className="text-xs text-[#A0A0B0] mb-5">
        Usuarios sin entrar hace 14 días o más y sin notificaciones: mitad recibió el mail, mitad no (control).
        {' '}“Volvieron”: entraron en la web o la app en los 7 días siguientes a su fecha.
        {mail?.primerEnvio && <> · Envíos del {fecha(mail.primerEnvio)} al {fecha(mail.ultimoEnvio)}</>}
      </p>

      {cargando ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[#FFFD02]" /></div>
      ) : !datos || datos.estado === 'error' ? (
        <p className="text-sm text-[#A0A0B0] py-6 text-center">No se pudieron traer los datos.</p>
      ) : datos.estado === 'sin_migracion' ? (
        <p className="text-sm text-[#A0A0B0] py-6 text-center">
          Falta correr <code className="text-zinc-400">supabase-mail-prueba-2026-11.sql</code> en la base.
        </p>
      ) : datos.estado === 'sin_asignar' ? (
        <p className="text-sm text-[#A0A0B0] py-6 text-center">
          Todavía no se asignaron los grupos (<code className="text-zinc-400">scripts/mail-prueba.ts asignar</code>).
        </p>
      ) : (
        <>
          {diferencia !== null && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-xl border border-[#2A2A3A] p-3">
                <p className="text-[10px] text-[#A0A0B0]">Volvieron · mail</p>
                <p className="text-2xl font-black text-white tabular-nums">{pct(mail!.volvieron, mail!.conFecha)}</p>
              </div>
              <div className="rounded-xl border border-[#2A2A3A] p-3">
                <p className="text-[10px] text-[#A0A0B0]">Volvieron · control</p>
                <p className="text-2xl font-black text-white tabular-nums">{pct(control!.volvieron, control!.conFecha)}</p>
              </div>
              <div className="rounded-xl border border-[#2A2A3A] p-3">
                <p className="text-[10px] text-[#A0A0B0]">Diferencia</p>
                <p className={`text-2xl font-black tabular-nums ${diferencia > 0 ? 'text-emerald-400' : diferencia < 0 ? 'text-red-400' : 'text-white'}`}>
                  {diferencia > 0 ? '+' : ''}{diferencia.toLocaleString('es-AR')} pp
                </p>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-[#A0A0B0] text-left">
                  <th className="font-semibold py-1.5">Grupo</th>
                  <th className="font-semibold py-1.5 text-right">Asignados</th>
                  <th className="font-semibold py-1.5 text-right">Con fecha</th>
                  <th className="font-semibold py-1.5 text-right">Volvieron (7 días)</th>
                  <th className="font-semibold py-1.5 text-right">Llegaron desde el mail</th>
                  <th className="font-semibold py-1.5 text-right">Visitas desde el mail</th>
                  <th className="font-semibold py-1.5 text-right">Bajas</th>
                  <th className="font-semibold py-1.5 text-right">Rechazados</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {fila(mail, 'Mail')}
                {fila(control, 'Control')}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-[#A0A0B0] mt-3">
            “Con fecha”: en mail, a quienes ya les salió; en control, los de las tandas que ya corrieron (misma hora). Los % son sobre “con fecha”:
            {' '}hasta que pasen 7 días de la última tanda, la ventana no está completa.
            {' '}“Llegaron desde el mail”: personas que abrieron un link del mail en la web (la app todavía no registra los utm, así que quien lo abrió en la app cuenta sólo en “volvieron”).
            {' '}Con 300 por grupo, una diferencia de menos de ~5 puntos puede ser azar.
          </p>
        </>
      )}
    </section>
  )
}
