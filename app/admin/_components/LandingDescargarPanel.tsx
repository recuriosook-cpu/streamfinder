'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, ExternalLink, Globe, UserPlus, Eye, Clock, Files } from 'lucide-react'
import { DISPOSITIVO_LABEL } from '@/lib/device'
import type { DescargarResumen, PasoEmbudo } from '@/app/api/admin/descargar/route'
import { VENTANAS, VENTANA_POR_DEFECTO, type Ventana } from '@/lib/metricas-ventanas'

/**
 * El panel de la landing `/descargar`, entero.
 *
 * Vive en su propio archivo y se pide sus propios datos. No es sólo prolijidad:
 * el filtro de 7 y 30 días tiene que poder recargar esta sección sin volver a
 * traer las siete consultas del resto de `/admin/métricas`, que tardan lo suyo.
 * Con el estado acá adentro, cambiar la ventana es un fetch y nada más.
 *
 * ── Qué cuenta cada número ────────────────────────────────────────────────
 *
 * Todo cuenta SESIONES, no eventos. Una persona que toca el botón tres veces
 * es una sesión que tocó el botón, no tres clicks. Es la única forma de que el
 * embudo cierre: con eventos, esa persona daría 300% de conversión sobre su
 * propia visita. El agregado está en `supabase-analytics-descargar.sql`.
 *
 * ── Lo que el panel no puede saber ────────────────────────────────────────
 *
 * Quien se va a Play Store sale del sitio y no vuelve. De esa rama se cuenta el
 * click y nada más: la instalación ocurre en Google. El cartel de abajo lo dice
 * en pantalla, porque es exactamente el número que alguien va a leer como
 * "instalaciones" si no se lo aclara.
 */

// ── Formato ────────────────────────────────────────────────────────────────

function formatearDuracion(segundos: number | null): string {
  if (segundos === null) return '—'
  const total = Math.round(segundos)
  if (total < 60) return `${total}s`
  const min = Math.floor(total / 60)
  const seg = total % 60
  return seg === 0 ? `${min}m` : `${min}m ${seg}s`
}

function formatearPct(pct: number | null): string {
  return pct === null ? '—' : `${pct}%`
}

const numero = (n: number) => n.toLocaleString('es-AR')

// ── Piezas ─────────────────────────────────────────────────────────────────

/**
 * Un paso del embudo.
 *
 * La barra se mide contra las visitas y no contra el paso anterior, para que
 * las tres se puedan comparar de un vistazo. El porcentaje sobre el paso
 * anterior va al costado en texto: es el que dice si el problema está en este
 * paso o venía de antes.
 */
function PasoBarra({ paso, maximo }: { paso: PasoEmbudo; maximo: number }) {
  const ancho = maximo > 0 ? Math.max((paso.valor / maximo) * 100, paso.valor > 0 ? 1.5 : 0) : 0
  const esPrimero = paso.pctSobreAnterior === null

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-xs font-semibold text-white">{paso.etiqueta}</span>
        <span className="text-xs text-[#A0A0B0] tabular-nums">
          <span className="text-white font-bold text-sm">{numero(paso.valor)}</span>
          {!esPrimero && (
            <>
              {' · '}
              <span className="text-[#FFFD02] font-semibold">{formatearPct(paso.pctSobreVisitas)}</span>
              <span className="text-zinc-600"> del total</span>
              {' · '}
              <span>{formatearPct(paso.pctSobreAnterior)}</span>
              <span className="text-zinc-600"> del paso anterior</span>
            </>
          )}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-[#0A0A0F] overflow-hidden">
        <div
          className={`h-full rounded-full ${esPrimero ? 'bg-[#FFFD02]/40' : 'bg-[#FFFD02]'}`}
          style={{ width: `${ancho}%` }}
        />
      </div>
    </div>
  )
}

function Tile({
  icono, label, valor, hint,
}: {
  icono: React.ReactNode
  label: string
  valor: string
  hint: string
}) {
  return (
    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] p-4">
      <div className="flex items-center gap-1.5 text-[#A0A0B0] mb-2">
        {icono}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-black tabular-nums text-white">{valor}</p>
      <p className="text-[10px] text-[#A0A0B0] mt-1">{hint}</p>
    </div>
  )
}

/*
  Los botones salen de la misma lista que valida el endpoint, no de una copia:
  agregar una ventana es tocar `lib/metricas-ventanas.ts` y nada más.
*/

// ── Panel ──────────────────────────────────────────────────────────────────

export function LandingDescargarPanel() {
  const [dias, setDias] = useState<Ventana>(VENTANA_POR_DEFECTO)
  const [datos, setDatos] = useState<DescargarResumen | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async (ventana: Ventana) => {
    setCargando(true)
    try {
      const r = await fetch(`/api/admin/descargar?dias=${ventana}`)
      setDatos(r.ok ? ((await r.json()) as DescargarResumen) : null)
    } catch {
      setDatos(null)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar(dias) }, [dias, cargar])

  const visitas = datos?.embudo.pasos.find(p => p.clave === 'visitas')?.valor ?? 0

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">

      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-white">
          Landing <code className="text-zinc-500 font-normal">/descargar</code>
        </h2>

        {/* El filtro va arriba a la derecha y no abajo: es lo primero que se
            toca al mirar la sección, y tiene que estar a la vista sin scrollear
            el embudo entero. */}
        <div className="flex rounded-lg border border-[#2A2A3A] overflow-hidden shrink-0">
          {VENTANAS.map(opcion => (
            <button
              key={opcion}
              type="button"
              onClick={() => setDias(opcion)}
              aria-pressed={dias === opcion}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                dias === opcion
                  ? 'bg-[#FFFD02] text-[#0A0A0F]'
                  : 'text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27]'
              }`}
            >
              {opcion} días
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-[#A0A0B0] mb-5">
        Sesiones que entraron por la landing, sólo tráfico humano
        {datos?.desde && <> · medimos desde el {new Date(datos.desde).toLocaleDateString('es-AR')}</>}
      </p>

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-[#FFFD02]" />
        </div>
      ) : !datos || !datos.disponible ? (
        <VacioPanel datos={datos} dias={dias} />
      ) : (
        <>
          {/* ── Embudo ────────────────────────────────────────────────── */}
          <div className="space-y-3.5 mb-5">
            {datos.embudo.pasos.map(paso => (
              <PasoBarra key={paso.clave} paso={paso} maximo={visitas} />
            ))}
          </div>

          {/* Reparto del paso del medio. Va como dos chips debajo del embudo y
              no como dos pasos más: Play Store y el sitio son ramas paralelas,
              no etapas sucesivas, y ponerlas en la escalera daría a entender
              que una lleva a la otra. */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] p-3.5">
              <div className="flex items-center gap-1.5 text-[#A0A0B0] mb-1.5">
                <ExternalLink size={13} />
                <span className="text-xs font-semibold">Se fueron a Google Play</span>
              </div>
              <p className="text-xl font-black tabular-nums text-white">
                {numero(datos.embudo.aPlayStore)}
              </p>
              <p className="text-[10px] text-[#A0A0B0] mt-1">
                acá se pierden de vista: la instalación ocurre en Google
              </p>
            </div>

            <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] p-3.5">
              <div className="flex items-center gap-1.5 text-[#A0A0B0] mb-1.5">
                <Globe size={13} />
                <span className="text-xs font-semibold">Entraron al sitio</span>
              </div>
              <p className="text-xl font-black tabular-nums text-white">
                {numero(datos.embudo.aWeb)}
              </p>
              <p className="text-[10px] text-[#A0A0B0] mt-1">
                {formatearPct(datos.embudo.registrosSobreWebPct)} de estos se registró
              </p>
            </div>
          </div>

          {/* ── Comportamiento de esas sesiones ───────────────────────── */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <Tile
              icono={<Clock size={13} />}
              label="Tiempo promedio"
              valor={formatearDuracion(datos.sesion.segundosPromedio)}
              hint="por sesión, topeado en 30 min"
            />
            <Tile
              icono={<Files size={13} />}
              label="Páginas promedio"
              valor={datos.sesion.vistasPromedio === null ? '—' : datos.sesion.vistasPromedio.toFixed(1)}
              hint="por sesión, incluida la landing"
            />
          </div>

          {/* ── Por dispositivo ───────────────────────────────────────── */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
                  <th className="text-left  font-medium py-2 pr-3">Dispositivo</th>
                  <th className="text-right font-medium py-2 px-3">Visitas</th>
                  <th className="text-right font-medium py-2 px-3">→ Play Store</th>
                  <th className="text-right font-medium py-2 px-3">→ Sitio</th>
                  <th className="text-right font-medium py-2 px-3">Registros</th>
                  <th className="text-right font-medium py-2 pl-3">Conversión</th>
                </tr>
              </thead>
              <tbody>
                {datos.porDispositivo.map(fila => (
                  <tr key={fila.dispositivo} className="border-b border-[#2A2A3A]/60 last:border-0">
                    <td className="py-2.5 pr-3 text-white">{DISPOSITIVO_LABEL[fila.dispositivo]}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300">{numero(fila.visitas)}</td>
                    {/* En iPhone/iPad la página no muestra botón de Play Store, así que
                        un 0 ahí no es "nadie lo tocó" sino "no se ofrece". Un guion lo
                        dice; un cero mentiría. */}
                    <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300">
                      {fila.dispositivo === 'ios'
                        ? <span className="text-zinc-600" title="No se ofrece en iOS">—</span>
                        : numero(fila.aPlayStore)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300">{numero(fila.aWeb)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-zinc-300">{numero(fila.registros)}</td>
                    <td className="py-2.5 pl-3 text-right tabular-nums font-semibold text-[#FFFD02]">
                      {formatearPct(fila.conversionPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-[#A0A0B0] mt-4 leading-relaxed">
            Cada número es una sesión, no un click: alguien que toca el botón tres veces
            cuenta una vez. El registro se atribuye por la marca de origen que la landing
            deja en la sesión, así que sólo cuenta a quien se registró sin cerrar la pestaña.
          </p>
        </>
      )}
    </section>
  )
}

// ── Vacío ──────────────────────────────────────────────────────────────────

/**
 * Los tres motivos por los que puede no haber nada, cada uno con su texto.
 *
 * Distinguirlos no es cosmético. "Falta correr el SQL" es una tarea pendiente
 * para el que está mirando; "todavía no entró nadie" es una landing que no
 * recibió tráfico; y un fetch fallido es un error. Con un único "Sin datos"
 * para los tres, el primero se ve igual que el segundo y nadie corre la
 * migración nunca.
 */
function VacioPanel({ datos, dias }: { datos: DescargarResumen | null; dias: Ventana }) {
  if (!datos) {
    return (
      <p className="text-[#A0A0B0] text-sm py-8 text-center">
        No se pudo cargar el panel.
      </p>
    )
  }

  if (datos.motivo === 'sin_migracion') {
    return (
      <div className="py-8 text-center">
        <p className="text-[#A0A0B0] text-sm">Falta correr la migración.</p>
        <p className="text-xs text-zinc-500 mt-1.5">
          Pegá <code className="text-zinc-400">supabase-analytics-descargar.sql</code> en el
          SQL Editor de Supabase y recargá.
        </p>
      </div>
    )
  }

  return (
    <div className="py-8 text-center">
      <div className="flex justify-center mb-2 text-zinc-600"><Eye size={20} /></div>
      <p className="text-[#A0A0B0] text-sm">
        Ninguna sesión entró por la landing en los últimos {dias} días.
      </p>
      {!datos.desde && (
        <p className="text-xs text-zinc-500 mt-1.5 flex items-center justify-center gap-1.5">
          <UserPlus size={12} />
          La marca de origen se despliega con esta versión: los datos empiezan ahora.
        </p>
      )}
    </div>
  )
}
