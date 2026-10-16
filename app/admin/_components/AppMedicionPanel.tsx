'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { EmbudoOnboarding, MedicionApp } from '@/app/api/admin/app-medicion/route'

/**
 * Lo nuevo de la app: embudo de onboarding por flujo, notificaciones y modo
 * deslizar. Los datos salen de `/api/admin/app-medicion`.
 *
 * "Personas" son instalaciones de la app o navegadores (`anon_id`), no
 * cuentas: el onboarding y los pedidos de permiso pasan antes de que se sepa
 * bien quién es. Cada bloque dice desde cuándo hay datos; los que son la foto
 * de hoy (tokens, interruptores) lo dicen también.
 */

const numero = (n: number) => n.toLocaleString('es-AR')
const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('es-AR')}%`)
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR')

function Bloque({ titulo, subtitulo, children }: { titulo: string; subtitulo: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-white mb-1">{titulo}</h2>
      <p className="text-xs text-[#A0A0B0] mb-5">{subtitulo}</p>
      {children}
    </div>
  )
}

function Desde({ desde, ultimo }: { desde: string | null; ultimo?: string | null }) {
  if (!desde) return <>Todavía no hay datos</>
  return (
    <>
      Se mide desde el {fecha(desde)}
      {ultimo && <> · último dato el {fecha(ultimo)}</>}
    </>
  )
}

function Cifra({ label, valor, detalle }: { label: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] p-4">
      <p className="text-[11px] uppercase tracking-wide text-[#A0A0B0]">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums mt-1">{valor}</p>
      {detalle && <p className="text-[11px] text-zinc-500 mt-1">{detalle}</p>}
    </div>
  )
}

/** Una barra horizontal: el ancho es el porcentaje sobre el primer paso. */
function Barra({ valor }: { valor: number | null }) {
  return (
    <div className="h-2 rounded-full bg-[#2A2A3A] overflow-hidden">
      <div className="h-full rounded-full bg-[#FFFD02]" style={{ width: `${Math.min(100, valor ?? 0)}%` }} />
    </div>
  )
}

function Embudo({ flujo }: { flujo: EmbudoOnboarding }) {
  const vacio = flujo.pasos.every(p => p.personas === 0)
  return (
    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-white">{flujo.titulo}</p>
        <p className="text-[11px] text-[#A0A0B0]"><Desde desde={flujo.desde} ultimo={flujo.ultimo} /></p>
      </div>
      {vacio ? (
        <p className="text-xs text-[#A0A0B0] py-3">
          {flujo.clave === 'web_corto'
            ? 'Sin datos todavía: llegan con el primer registro en la web.'
            : 'Sin datos todavía: llegan con la versión de la app que trae este flujo.'}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
              <th className="text-left font-medium py-2 pr-3">Paso</th>
              <th className="font-medium py-2 px-2 w-1/3" />
              <th className="text-right font-medium py-2 px-2">Llegaron</th>
              <th className="text-right font-medium py-2 px-2">%</th>
              <th className="text-right font-medium py-2 pl-2">Saltearon acá</th>
            </tr>
          </thead>
          <tbody>
            {flujo.pasos.map((p, i) => (
              <tr key={p.nombre} className="border-b border-[#2A2A3A]/60 last:border-0">
                <td className="py-2 pr-3 text-white whitespace-nowrap">
                  <span className="text-zinc-500 tabular-nums mr-1.5">{i + 1}.</span>{p.nombre}
                </td>
                <td className="py-2 px-2"><Barra valor={p.pct} /></td>
                <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(p.personas)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-white font-semibold">{pct(p.pct)}</td>
                <td className="py-2 pl-2 text-right tabular-nums text-amber-300">
                  {p.saltearon > 0 ? numero(p.saltearon) : <span className="text-zinc-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {flujo.saltosSinPaso > 0 && (
        <p className="text-[11px] text-zinc-500 mt-2">
          {numero(flujo.saltosSinPaso)} saltearon en un paso que este flujo no tiene.
        </p>
      )}
    </div>
  )
}

export function AppMedicionPanel({ recarga }: { recarga: number }) {
  const [datos, setDatos] = useState<MedicionApp | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/admin/app-medicion', { cache: 'no-store' })
      .then(async res => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.message ?? `Error ${res.status}`)
        if (vivo) { setDatos(json as MedicionApp); setError(null) }
      })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar') })
    return () => { vivo = false }
  }, [recarga])

  if (error) {
    return (
      <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 text-sm text-red-300 flex items-center gap-2">
        <AlertTriangle size={15} /> Medición de la app: {error}
      </div>
    )
  }
  if (!datos) {
    return (
      <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 text-sm text-[#A0A0B0] flex items-center gap-2">
        <Loader2 size={15} className="animate-spin" /> Cargando la medición de la app…
      </div>
    )
  }

  const { onboarding, notificaciones: n, deslizar: d } = datos

  return (
    <>
      <Bloque
        titulo="Embudo de onboarding"
        subtitulo="Personas (instalaciones o navegadores) que vieron cada paso, por flujo. Los flujos viejos aparecen mientras sigan llegando datos (últimos 30 días)."
      >
        <div className="space-y-4">
          {onboarding.map(f => <Embudo key={f.clave} flujo={f} />)}
        </div>
      </Bloque>

      <Bloque
        titulo="Notificaciones"
        subtitulo={<>Permiso: <Desde desde={n.permisoDesde} /> · tokens e interruptores: foto de hoy</>}
      >
        <div className="overflow-x-auto mb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
                <th className="text-left font-medium py-2 pr-3">Pedido desde</th>
                <th className="text-right font-medium py-2 px-2">Se ofreció</th>
                <th className="text-right font-medium py-2 px-2">Aceptaron</th>
                <th className="text-right font-medium py-2 px-2">“Ahora no”</th>
                <th className="text-right font-medium py-2 pl-2">Dijeron sí, el sistema no</th>
              </tr>
            </thead>
            <tbody>
              {n.permiso.map(p => (
                <tr key={p.origen} className="border-b border-[#2A2A3A]/60 last:border-0">
                  <td className="py-2 pr-3 text-white capitalize">{p.origen}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(p.ofrecidos)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    <span className="text-emerald-400 font-semibold">{pct(p.ofrecidos ? Math.round(p.aceptaron / p.ofrecidos * 1000) / 10 : null)}</span>
                    <span className="text-zinc-600 text-[11px] ml-1">({numero(p.aceptaron)})</span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    <span className="text-amber-300 font-semibold">{pct(p.ofrecidos ? Math.round(p.ahoraNo / p.ofrecidos * 1000) / 10 : null)}</span>
                    <span className="text-zinc-600 text-[11px] ml-1">({numero(p.ahoraNo)})</span>
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums text-zinc-400">{numero(p.negadoPorSistema)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-[#A0A0B0] mt-2 leading-relaxed">
            Aceptaron = tocaron “Sí” y el sistema dio el permiso. “Dijeron sí, el sistema no” = tocaron “Sí” pero lo
            negaron en el diálogo del teléfono (o falló). Sobre instalaciones distintas.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Cifra
            label="Usuarios con token"
            valor={numero(n.usuariosConToken)}
            detalle={
              n.instalacionesActivas !== null
                ? <>
                    {pct(n.instalacionesActivas ? Math.round(n.usuariosConToken / n.instalacionesActivas * 1000) / 10 : null)}
                    {' '}de {numero(n.instalacionesActivas)} instalaciones activas en 30 días
                    {n.instalacionesConSesion !== null && <> ({numero(n.instalacionesConSesion)} con sesión)</>}
                    {' '}· {numero(n.aparatosConToken)} aparatos
                    {n.instalacionesDesde &&
                      <> · instalaciones medidas desde el {fecha(n.instalacionesDesde)}</>}
                  </>
                : <>{numero(n.aparatosConToken)} aparatos · falta la función admin_app_uso</>
            }
          />
          {n.interruptores.map(i => (
            <Cifra
              key={i.clave}
              label={`Apagaron “${i.nombre}”`}
              valor={numero(i.apagados)}
              detalle={<>{numero(i.apagadosConToken)} de los {numero(n.usuariosConToken)} con token · sobre {numero(n.perfiles)} perfiles</>}
            />
          ))}
        </div>
      </Bloque>

      <Bloque titulo="Modo deslizar" subtitulo={<Desde desde={d.desde} />}>
        {d.personas === 0 ? (
          <p className="text-xs text-[#A0A0B0] py-3">
            Sin datos todavía: llegan con la versión de la app que trae el modo deslizar.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {d.aperturas.map(a => (
                <Cifra
                  key={a.origen}
                  label={`Abrieron desde ${a.origen === 'que_ver' ? 'Qué ver' : a.origen === 'home' ? 'Home' : a.origen}`}
                  valor={numero(a.personas)}
                  detalle={`${numero(a.veces)} ${a.veces === 1 ? 'vez' : 'veces'}`}
                />
              ))}
              <Cifra
                label="Tarjetas por persona"
                valor={d.tarjetasPromedio?.toLocaleString('es-AR') ?? '—'}
                detalle={<>promedio · mediana {d.tarjetasMediana?.toLocaleString('es-AR') ?? '—'} · {numero(d.personas)} personas</>}
              />
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
                  <th className="text-left font-medium py-2 pr-3">Acción</th>
                  <th className="font-medium py-2 px-2 w-1/2" />
                  <th className="text-right font-medium py-2 px-2">Veces</th>
                  <th className="text-right font-medium py-2 pl-2">%</th>
                </tr>
              </thead>
              <tbody>
                {d.acciones.map(a => (
                  <tr key={a.accion} className="border-b border-[#2A2A3A]/60 last:border-0">
                    <td className="py-2 pr-3 text-white">{a.nombre}</td>
                    <td className="py-2 px-2"><Barra valor={a.pct} /></td>
                    <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(a.veces)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums text-white font-semibold">{pct(a.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-[#A0A0B0] mt-3 leading-relaxed">
              Tarjetas por persona = acciones menos las que deshizo, sobre todos los que entraron (quien entró y no
              pasó ninguna cuenta como cero). El reparto cuenta todas las acciones; se deshicieron {numero(d.deshechas)}.
            </p>
          </>
        )}
      </Bloque>
    </>
  )
}
