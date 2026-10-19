'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { CaminoPermiso, EmbudoOnboarding, MedicionApp, Provisional } from '@/app/api/admin/app-medicion/route'

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

/** Un porcentaje sobre los que vieron el cartel, con la cantidad al lado. */
function Sobre({ n, de, tono }: { n: number; de: number; tono: string }) {
  return (
    <>
      <span className={`font-semibold ${tono}`}>{pct(de ? Math.round(n / de * 1000) / 10 : null)}</span>
      <span className="text-zinc-600 text-[11px] ml-1">({numero(n)})</span>
    </>
  )
}

/**
 * El pedido de notificaciones por camino: el onboarding y los momentos en
 * contexto de la 1.0.16. Vieron → tocaron → activaron, más los que no
 * respondieron, que en el onboarding eran la mayoría.
 */
function TablaCaminos({ caminos, provisional }: { caminos: CaminoPermiso[]; provisional: Provisional }) {
  return (
    <div className="overflow-x-auto mb-5">
      <p className="text-xs font-semibold text-white mb-2">Pedido de notificaciones por camino</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
            <th className="text-left font-medium py-2 pr-3">Camino</th>
            <th className="text-right font-medium py-2 px-2">Lo vieron</th>
            <th className="text-right font-medium py-2 px-2">Activar</th>
            <th className="text-right font-medium py-2 px-2">Activaron</th>
            <th className="text-right font-medium py-2 px-2">“Ahora no”</th>
            <th className="text-right font-medium py-2 pl-2">Sin responder</th>
          </tr>
        </thead>
        <tbody>
          {caminos.map(c => (
            <tr key={c.clave} className="border-b border-[#2A2A3A]/60 last:border-0">
              <td className="py-2 pr-3 text-white">{c.nombre}</td>
              <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(c.vieron)}</td>
              <td className="py-2 px-2 text-right tabular-nums"><Sobre n={c.tocaron} de={c.vieron} tono="text-white" /></td>
              <td className="py-2 px-2 text-right tabular-nums"><Sobre n={c.activaron} de={c.vieron} tono="text-emerald-400" /></td>
              <td className="py-2 px-2 text-right tabular-nums"><Sobre n={c.ahoraNo} de={c.vieron} tono="text-amber-300" /></td>
              <td className="py-2 pl-2 text-right tabular-nums"><Sobre n={c.sinResponder} de={c.vieron} tono="text-zinc-400" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-[#A0A0B0] mt-2 leading-relaxed">
        Activar = tocaron el botón (en iPhone con permiso provisional, “Que suenen”; si estaba bloqueado, “Abrir
        ajustes”). Activaron = terminaron con el permiso dado. Sin responder = lo vieron y no tocaron nada. Sobre
        instalaciones distintas; una misma instalación puede ver un camino más de una vez.
      </p>
      <p className="text-[11px] text-[#A0A0B0] mt-3">
        <span className="text-white font-semibold">iPhone, permiso provisional:</span>{' '}
        {numero(provisional.loTienen)} lo recibieron · {numero(provisional.normales)} pasaron a notificaciones
        normales · {numero(provisional.desactivadas)} las desactivaron
      </p>
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

  const { onboarding, notificaciones: n, deslizar: d, anuncios: an } = datos

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
        <TablaCaminos caminos={n.caminos} provisional={n.provisional} />

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

      <Bloque
        titulo="Anuncios por lugar"
        subtitulo={<>Últimos 30 días · <Desde desde={an.desde} /></>}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
              <th className="text-left font-medium py-2 pr-3">Lugar</th>
              <th className="text-right font-medium py-2 px-2">Cargados</th>
              <th className="text-right font-medium py-2 px-2">Android / iOS</th>
              <th className="text-right font-medium py-2 px-2">Sin relleno</th>
              <th className="text-right font-medium py-2 px-2">Errores</th>
              <th className="text-right font-medium py-2 pl-2">% cargados</th>
            </tr>
          </thead>
          <tbody>
            {an.lugares.map(l => (
              <tr key={l.ubicacion} className="border-b border-[#2A2A3A]/60 last:border-0">
                <td className="py-2 pr-3 text-white">{l.nombre}</td>
                <td className="py-2 px-2 text-right tabular-nums text-white font-semibold">{numero(l.cargados)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-zinc-400">{numero(l.android)} / {numero(l.ios)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-zinc-400">{numero(l.sinRelleno)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-zinc-400">{numero(l.errores)}</td>
                <td className="py-2 pl-2 text-right tabular-nums text-emerald-400 font-semibold">{pct(l.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-[#A0A0B0] mt-3 leading-relaxed">
          Cargados = anuncios que llegaron para ese lugar (en la ficha o al pie de una pantalla, puede que no se haya llegado a verlos). Sin relleno = AdMob no tenía uno para mostrar;
          errores = el pedido falló (red, tiempo agotado). El lugar viaja desde la app 1.0.16
          {an.sinLugar > 0 && <>; {numero(an.sinLugar)} cargados de versiones anteriores no lo dicen y no están en la tabla</>}.
        </p>
      </Bloque>
    </>
  )
}
