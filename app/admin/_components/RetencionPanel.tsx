'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, Repeat, UserMinus, LogIn, Smartphone } from 'lucide-react'
import type {
  RetencionResumen, CohorteRetencion, DiaRetencion, CohorteApp, PasoRegistro, GrupoComportamiento,
  GrupoApp, EmbudoPlataforma, FlujoOnboarding,
} from '@/app/api/admin/retencion/route'

/**
 * La sección de retención.
 *
 * Cinco bloques: retención de la app por instalación (Android e iOS por
 * separado), retención de los usuarios registrados por semana de alta, embudo
 * del registro (web y app, con el onboarding por flujo), sesiones de la
 * primera semana y qué hizo distinto el que volvió.
 *
 * ── Dos denominadores distintos en la misma sección ───────────────────────
 *
 * El bloque de la app cuenta INSTALACIONES y el de cohortes cuenta CUENTAS
 * REGISTRADAS, que vuelven por la web o por la app. No son lo mismo y no se
 * restan: una instalación que nunca se registró existe sólo en el primero.
 *
 * Mezclarlos es el error fácil de cometer mirando esto, así que el cartel de
 * arriba lo dice en pantalla y no sólo acá.
 *
 * ── Por qué hay tantos guiones ────────────────────────────────────────────
 *
 * Un `—` acá significa "todavía no se puede saber", y aparece a propósito en
 * los lugares donde la alternativa sería un cero mentiroso: la cohorte de esta
 * semana no tiene D30 porque no pasaron 30 días, no porque nadie haya vuelto.
 */

const numero = (n: number) => n.toLocaleString('es-AR')
const pct = (v: number | null) => (v === null ? '—' : `${v}%`)
const dec = (v: number | null) => (v === null ? '—' : v.toLocaleString('es-AR'))

/** `2026-09-14` → `14/9`. */
function semanaCorta(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)}/${Number(m)}`
}

// ── Cohortes ───────────────────────────────────────────────────────────────

/**
 * Una celda de retención, coloreada según el valor.
 *
 * El color va por umbrales fijos y no relativo al resto de la tabla: una
 * escala relativa pintaría de verde el mejor número aunque fuera malo, que es
 * exactamente lo que no se quiere de un panel que existe para detectar un
 * problema.
 */
function CeldaRetencion({ valor, pctValor }: { valor: number; pctValor: number | null }) {
  if (pctValor === null) {
    return (
      <td className="py-2 px-2 text-right">
        <span className="text-zinc-600" title="La cohorte todavía no cumplió el plazo">—</span>
      </td>
    )
  }

  const tono =
    pctValor >= 40 ? 'text-emerald-400' :
    pctValor >= 20 ? 'text-amber-400' :
    'text-red-400'

  return (
    <td className="py-2 px-2 text-right tabular-nums">
      <span className={`font-semibold ${tono}`}>{pctValor}%</span>
      <span className="text-zinc-600 text-[11px] ml-1">({valor})</span>
    </td>
  )
}

/**
 * La misma tabla que la de la web, con otra primera columna.
 *
 * Aparte y no un componente genérico con props: son cinco líneas de JSX y
 * generalizarlo obligaría a parametrizar el nombre de la métrica, el de la
 * columna y el tipo de la fila para ahorrar eso. La celda coloreada, que es
 * lo que sí tiene lógica, sí se comparte.
 */
function TablaApp({ cohortes }: { cohortes: CohorteApp[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
            <th className="text-left  font-medium py-2 pr-3">Semana</th>
            <th className="text-right font-medium py-2 px-2">Instalaciones</th>
            <th className="text-right font-medium py-2 px-2">Día 1</th>
            <th className="text-right font-medium py-2 px-2">Día 7</th>
            <th className="text-right font-medium py-2 px-2">Día 30</th>
          </tr>
        </thead>
        <tbody>
          {cohortes.map(c => (
            <tr key={c.semana} className="border-b border-[#2A2A3A]/60 last:border-0">
              <td className="py-2 pr-3 text-white tabular-nums">{semanaCorta(c.semana)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(c.instalaciones)}</td>
              <CeldaRetencion valor={c.d1}  pctValor={c.d1Pct} />
              <CeldaRetencion valor={c.d7}  pctValor={c.d7Pct} />
              <CeldaRetencion valor={c.d30} pctValor={c.d30Pct} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TablaCohortes({ cohortes }: { cohortes: CohorteRetencion[] }) {
  if (cohortes.length === 0) {
    return (
      <p className="text-xs text-[#A0A0B0] py-4">
        Todavía no hay ninguna semana de altas posterior al inicio de la medición.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
            <th className="text-left  font-medium py-2 pr-3">Semana de alta</th>
            <th className="text-right font-medium py-2 px-2">Altas</th>
            <th className="text-right font-medium py-2 px-2">Día 1</th>
            <th className="text-right font-medium py-2 px-2">Día 7</th>
            <th className="text-right font-medium py-2 px-2">Día 30</th>
          </tr>
        </thead>
        <tbody>
          {cohortes.map(c => (
            <tr key={c.semana} className="border-b border-[#2A2A3A]/60 last:border-0">
              <td className="py-2 pr-3 text-white tabular-nums">{semanaCorta(c.semana)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(c.usuarios)}</td>
              <CeldaRetencion valor={c.d1}  pctValor={c.d1Pct} />
              <CeldaRetencion valor={c.d7}  pctValor={c.d7Pct} />
              <CeldaRetencion valor={c.d30} pctValor={c.d30Pct} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** `2026-10-26` → `lun 26/10`. */
function diaCorto(iso: string): string {
  const dia = DIAS_SEMANA[new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()]
  return `${dia} ${semanaCorta(iso)}`
}

function TablaPorDia({ dias }: { dias: DiaRetencion[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
            <th className="text-left  font-medium py-2 pr-3">Día de alta</th>
            <th className="text-right font-medium py-2 px-2">Altas</th>
            <th className="text-right font-medium py-2 px-2">Día 1</th>
            <th className="text-right font-medium py-2 px-2">Día 7</th>
          </tr>
        </thead>
        <tbody>
          {dias.map(d => (
            <tr key={d.dia} className="border-b border-[#2A2A3A]/60 last:border-0">
              <td className="py-2 pr-3 text-white tabular-nums">{diaCorto(d.dia)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(d.usuarios)}</td>
              <CeldaRetencion valor={d.d1} pctValor={d.d1Pct} />
              <CeldaRetencion valor={d.d7} pctValor={d.d7Pct} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Embudo del registro ────────────────────────────────────────────────────

function FilaPasoRegistro({ paso, maximo }: { paso: PasoRegistro; maximo: number }) {
  const ancho = maximo > 0 ? Math.max((paso.usuarios / maximo) * 100, paso.usuarios > 0 ? 1.5 : 0) : 0

  // Una caída de más de la mitad respecto del paso anterior es el dato que la
  // sección existe para encontrar; se marca para que salte a la vista.
  const caidaFuerte = paso.pctSobreAnterior !== null && paso.pctSobreAnterior < 50

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-xs text-white flex items-center gap-1.5">
          {paso.etiqueta}
          {caidaFuerte && <AlertTriangle size={11} className="text-red-400 shrink-0" />}
        </span>
        <span className="text-[11px] text-[#A0A0B0] tabular-nums shrink-0">
          <span className="text-white font-semibold">{numero(paso.usuarios)}</span>
          {paso.pctSobreAnterior !== null && (
            <>
              {' · '}
              <span className={caidaFuerte ? 'text-red-400 font-semibold' : ''}>
                {pct(paso.pctSobreAnterior)}
              </span>
              <span className="text-zinc-600"> del anterior</span>
            </>
          )}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#0A0A0F] overflow-hidden">
        <div
          className={`h-full rounded-full ${caidaFuerte ? 'bg-red-500/70' : 'bg-[#FFFD02]'}`}
          style={{ width: `${ancho}%` }}
        />
      </div>
    </div>
  )
}

/** Una escalera de pasos con su barra, escalada contra su primer paso. */
function Escalera({ pasos }: { pasos: PasoRegistro[] }) {
  const maximo = pasos[0]?.usuarios ?? 0
  return (
    <div className="space-y-2.5">
      {pasos.map(p => <FilaPasoRegistro key={p.clave} paso={p} maximo={maximo} />)}
    </div>
  )
}

const NOMBRE_FLUJO: Record<FlujoOnboarding['flujo'], string> = {
  corto: 'Onboarding nuevo (3 pasos)',
  viejo: 'Onboarding viejo',
}

/**
 * El embudo de una plataforma: el alta y, debajo, cada flujo de onboarding
 * con su propia escalera. Los flujos no se encadenan con el alta: el
 * onboarding también lo ven cuentas viejas, y un porcentaje "sobre los que
 * completaron el registro" mezclaría dos poblaciones.
 */
function EmbudoDePlataforma({ embudo }: { embudo: EmbudoPlataforma }) {
  return (
    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] p-4">
      <p className="text-xs font-semibold text-white mb-3">
        {embudo.plataforma === 'web' ? 'Web' : 'App'}
        <span className="text-[10px] text-[#A0A0B0] font-normal">
          {' · '}{embudo.plataforma === 'web' ? 'navegadores' : 'instalaciones'}
        </span>
      </p>
      <Escalera pasos={embudo.registro} />

      {embudo.onboarding.length === 0 ? (
        <p className="text-[10px] text-[#A0A0B0] mt-4">Sin onboarding en los últimos 30 días.</p>
      ) : embudo.onboarding.map(f => (
        <div key={f.flujo} className="mt-5">
          <p className="text-[11px] font-semibold text-white mb-2">
            {NOMBRE_FLUJO[f.flujo]}
            {f.salteo > 0 && (
              <span className="text-[10px] text-[#A0A0B0] font-normal">
                {' · '}{numero(f.salteo)} lo saltearon
              </span>
            )}
          </p>
          <Escalera pasos={f.pasos} />
        </div>
      ))}
    </div>
  )
}

// ── Comportamiento ─────────────────────────────────────────────────────────

const METRICAS_COMPORTAMIENTO: {
  clave: keyof Pick<GrupoComportamiento, 'sesiones' | 'paginas' | 'calificaciones' | 'watchlist' | 'resenas' | 'favoritos'>
  etiqueta: string
}[] = [
  { clave: 'sesiones',       etiqueta: 'Sesiones' },
  { clave: 'paginas',        etiqueta: 'Páginas vistas' },
  { clave: 'calificaciones', etiqueta: 'Calificaciones' },
  { clave: 'watchlist',      etiqueta: 'Guardados en watchlist' },
  { clave: 'favoritos',      etiqueta: 'Favoritos' },
  { clave: 'resenas',        etiqueta: 'Reseñas' },
]

function TablaComportamiento({ grupos }: { grupos: GrupoComportamiento[] }) {
  const volvio = grupos.find(g => g.grupo === 'volvio')
  const noVolvio = grupos.find(g => g.grupo === 'no_volvio')

  if (!volvio || !noVolvio) {
    return (
      <p className="text-xs text-[#A0A0B0] py-4">
        Hace falta que haya usuarios en los dos grupos para comparar.
      </p>
    )
  }

  /** Cuántas veces más lo hizo el que volvió. `null` si el otro hizo cero. */
  const ratio = (a: number | null, b: number | null): string => {
    if (a === null || b === null || b === 0) return '—'
    return `${(a / b).toFixed(1)}×`
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
            <th className="text-left  font-medium py-2 pr-3">En sus primeros 7 días</th>
            <th className="text-right font-medium py-2 px-2 text-emerald-400">
              Volvió ({numero(volvio.usuarios)})
            </th>
            <th className="text-right font-medium py-2 px-2 text-red-400">
              No volvió ({numero(noVolvio.usuarios)})
            </th>
            <th className="text-right font-medium py-2 pl-2">Ratio</th>
          </tr>
        </thead>
        <tbody>
          {METRICAS_COMPORTAMIENTO.map(m => (
            <tr key={m.clave} className="border-b border-[#2A2A3A]/60">
              <td className="py-2 pr-3 text-zinc-300">{m.etiqueta}</td>
              <td className="py-2 px-2 text-right tabular-nums text-white">{dec(volvio[m.clave])}</td>
              <td className="py-2 px-2 text-right tabular-nums text-zinc-400">{dec(noVolvio[m.clave])}</td>
              <td className="py-2 pl-2 text-right tabular-nums font-semibold text-[#FFFD02]">
                {ratio(volvio[m.clave], noVolvio[m.clave])}
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-2 pr-3 text-zinc-300">Completó el onboarding</td>
            <td className="py-2 px-2 text-right tabular-nums text-white">{pct(volvio.onboardingCompletoPct)}</td>
            <td className="py-2 px-2 text-right tabular-nums text-zinc-400">{pct(noVolvio.onboardingCompletoPct)}</td>
            <td className="py-2 pl-2 text-right text-zinc-600">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const TITULO_SISTEMA: Record<GrupoApp['sistema'], string> = {
  android: 'Android',
  ios: 'iPhone (iOS)',
  sin_dato: 'Sin sistema conocido',
  todos: 'Android e iOS juntos',
}

// ── Panel ──────────────────────────────────────────────────────────────────

/**
 * `recarga` lo sube la página de métricas cuando se refresca: cada cambio
 * vuelve a pedir los datos.
 */
export function RetencionPanel({ recarga = 0 }: { recarga?: number }) {
  const [datos, setDatos] = useState<RetencionResumen | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    fetch('/api/admin/retencion', { cache: 'no-store' })
      .then(async r => (r.ok ? ((await r.json()) as RetencionResumen) : null))
      .catch(() => null)
      .then(d => { if (vivo) { setDatos(d); setCargando(false) } })
    return () => { vivo = false }
  }, [recarga])

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-white mb-1">Retención</h2>
      <p className="text-xs text-[#A0A0B0] mb-4">
        Qué pasa con la gente después de registrarse
        {datos?.medicionDesde && (
          <> · medimos desde el {new Date(datos.medicionDesde).toLocaleDateString('es-AR')}</>
        )}
      </p>

      {/*
        El aviso de alcance. Cambia de texto según si la app ya está mandando
        datos: mientras no llegue nada, sigue siendo la advertencia de que esto
        es sólo la web. Cuando llega, pasa a explicar qué mide cada bloque, que
        es la confusión que queda después.
      */}
      {!cargando && datos?.disponible && (datos.app.length === 0 ? (
        <div className="flex gap-2.5 rounded-xl border border-amber-900/50 bg-amber-500/5 p-3 mb-5">
          <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            <span className="font-semibold">Todavía no llega nada de la app.</span>{' '}
            Los bloques de abajo son la web. La app ya está instrumentada, pero hasta
            que la versión con analytics esté publicada e instalada no hay eventos
            con los que armar su retención — y hay que correr{' '}
            <code className="text-amber-100">supabase-analytics-app.sql</code>.
          </p>
        </div>
      ) : (
        <div className="flex gap-2.5 rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] p-3 mb-5">
          <Smartphone size={15} className="text-[#A0A0B0] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#A0A0B0] leading-relaxed">
            El primer bloque es la <span className="text-white font-semibold">app</span> y
            se cuenta por instalación; el segundo cuenta{' '}
            <span className="text-white font-semibold">cuentas registradas</span>, que
            vuelven por la web o por la app. No son el mismo denominador y no se restan
            entre sí.
          </p>
        </div>
      ))}

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-[#FFFD02]" />
        </div>
      ) : !datos || !datos.disponible ? (
        <VacioRetencion datos={datos} />
      ) : (
        <div className="space-y-7">

          {/* ── 0. Retención de la app ────────────────────────────── */}
          {datos.app.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-white mb-1 flex items-center gap-1.5">
                <Smartphone size={13} className="text-[#A0A0B0]" />
                App: vuelven, por semana de instalación
              </h3>
              <p className="text-[10px] text-[#A0A0B0] mb-3">
                Una instalación, no una cuenta: se cohortea por el primer evento que
                mandó ese aparato y cuenta los que no se registraron nunca. Si una
                instalación deja de aparecer, se abandonó o se borró — la tienda no dice
                cuál de las dos. Días de Argentina.
              </p>
              {!datos.separado.app && (
                <p className="text-[10px] text-amber-300/80 mb-3">
                  Android e iOS van juntos hasta que se corra{' '}
                  <code className="text-amber-200">supabase-metricas-2026-10.sql</code>.
                </p>
              )}
              <div className="space-y-5">
                {datos.app.map(g => (
                  <div key={g.sistema}>
                    <p className="text-[11px] font-semibold text-white mb-1.5">
                      {TITULO_SISTEMA[g.sistema]}
                      {g.sistema === 'sin_dato' && (
                        <span className="text-[10px] text-[#A0A0B0] font-normal">
                          {' · '}instalaciones que no abrieron la app desde el 15/10, cuando se
                          empezó a registrar el sistema
                        </span>
                      )}
                    </p>
                    <TablaApp cohortes={g.cohortes} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 1. Cohortes ───────────────────────────────────────── */}
          <div>
            <h3 className="text-xs font-semibold text-white mb-1 flex items-center gap-1.5">
              <Repeat size={13} className="text-[#A0A0B0]" />
              Usuarios registrados: vuelven, por semana de alta
            </h3>
            <p className="text-[10px] text-[#A0A0B0] mb-3">
              Cuenta como vuelta cualquier actividad con la sesión iniciada, en la web o
              en la app. Retención Día-N: tuvo actividad <em>ese</em> día, no antes ni
              después, en días de Argentina.
              Un <span className="text-zinc-500">—</span> es una cohorte que todavía no
              cumplió el plazo.
            </p>
            <TablaCohortes cohortes={datos.cohortes} />
          </div>

          {/* ── 1b. Por día de alta ───────────────────────────────── */}
          {datos.porDia?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-white mb-1 flex items-center gap-1.5">
                <Repeat size={13} className="text-[#A0A0B0]" />
                Usuarios registrados: vuelven, por día de alta
              </h3>
              <p className="text-[10px] text-[#A0A0B0] mb-3">
                Lo mismo que la tabla de arriba, día por día en las últimas dos semanas,
                para ver cada día sin esperar a que cierre la semana. Se recalcula cada
                hora. El día 1 de un alta se lee al terminar el día siguiente, y el día 7,
                una semana después.
              </p>
              <TablaPorDia dias={datos.porDia} />
            </div>
          )}

          {/* ── 2. Embudo del registro ────────────────────────────── */}
          <div>
            <h3 className="text-xs font-semibold text-white mb-1 flex items-center gap-1.5">
              <LogIn size={13} className="text-[#A0A0B0]" />
              Dónde abandonan el registro
            </h3>
            <p className="text-[10px] text-[#A0A0B0] mb-3">
              Navegadores o instalaciones distintas que llegaron a cada pantalla, últimos{' '}
              {datos.dias} días. El triángulo marca una caída de más de la mitad respecto del
              paso anterior. &quot;Completó&quot; cuenta sólo cuentas creadas en las 48 h
              anteriores, y &quot;Empezó&quot; incluye a los que completaron: la app todavía
              no marca el inicio cuando se entra con Google, Apple o Facebook.
            </p>
            {datos.embudos ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {datos.embudos.map(e => <EmbudoDePlataforma key={e.plataforma} embudo={e} />)}
              </div>
            ) : (
              <>
                <p className="text-[10px] text-amber-300/80 mb-3">
                  Web, app y los dos onboardings van mezclados hasta que se corra{' '}
                  <code className="text-amber-200">supabase-metricas-2026-10.sql</code>.
                </p>
                <Escalera pasos={datos.registro} />
              </>
            )}
          </div>

          {/* ── 3. Sesiones de la primera semana ──────────────────── */}
          {datos.sesiones && (
            <div>
              <h3 className="text-xs font-semibold text-white mb-1 flex items-center gap-1.5">
                <UserMinus size={13} className="text-[#A0A0B0]" />
                Sesiones en la primera semana
              </h3>
              <p className="text-[10px] text-[#A0A0B0] mb-3">
                Sobre {numero(datos.sesiones.usuarios)} usuarios cuya primera semana ya
                terminó. Los que se registraron hace menos de 7 días no entran: tendrían
                menos tiempo que el resto y bajarían el promedio sin que nada empeore.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Dato valor={dec(datos.sesiones.promedio)} label="Sesiones promedio" />
                <Dato valor={dec(datos.sesiones.mediana)}  label="Mediana" />
                <Dato valor={numero(datos.sesiones.unaSola)} label="Hicieron una sola" />
                <Dato
                  valor={pct(datos.sesiones.unaSolaYNoVolvioPct)}
                  label="Una sola y nunca más"
                  hint={`${numero(datos.sesiones.unaSolaYNoVolvio)} usuarios`}
                  destacado
                />
              </div>
              {datos.sesiones.sinActividad > 0 && (
                <p className="text-[10px] text-[#A0A0B0] mt-2.5">
                  {numero(datos.sesiones.sinActividad)} se registraron y no generaron
                  ninguna sesión medible.
                </p>
              )}
            </div>
          )}

          {/* ── 4. Comportamiento ─────────────────────────────────── */}
          <div>
            <h3 className="text-xs font-semibold text-white mb-1">
              Qué hicieron distinto los que volvieron
            </h3>
            <p className="text-[10px] text-[#A0A0B0] mb-3">
              Promedios por usuario, contando <strong>sólo los primeros 7 días</strong> — el
              tiempo que los dos grupos tuvieron por igual. Con el histórico completo, el
              que volvió gana siempre por tener más días, y la tabla no diría nada.
            </p>
            <TablaComportamiento grupos={datos.comportamiento} />
          </div>

        </div>
      )}
    </section>
  )
}

function Dato({
  valor, label, hint, destacado = false,
}: {
  valor: string; label: string; hint?: string; destacado?: boolean
}) {
  return (
    <div className={`rounded-xl border p-3 ${
      destacado ? 'border-red-900/50 bg-red-500/5' : 'border-[#2A2A3A] bg-[#0A0A0F]'
    }`}>
      <p className={`text-xl font-black tabular-nums ${destacado ? 'text-red-400' : 'text-white'}`}>
        {valor}
      </p>
      <p className="text-[10px] text-[#A0A0B0] mt-1">{label}</p>
      {hint && <p className="text-[10px] text-zinc-600">{hint}</p>}
    </div>
  )
}

// ── Vacío ──────────────────────────────────────────────────────────────────

function VacioRetencion({ datos }: { datos: RetencionResumen | null }) {
  if (!datos) {
    return <p className="text-[#A0A0B0] text-sm py-8 text-center">No se pudo cargar la sección.</p>
  }

  if (datos.motivo === 'sin_migracion') {
    return (
      <div className="py-8 text-center">
        <p className="text-[#A0A0B0] text-sm">Falta correr la migración.</p>
        <p className="text-xs text-zinc-500 mt-1.5">
          Pegá <code className="text-zinc-400">supabase-analytics-retencion.sql</code> en el
          SQL Editor de Supabase y recargá.
        </p>
      </div>
    )
  }

  return (
    <div className="py-8 text-center">
      <p className="text-[#A0A0B0] text-sm">Todavía no hay suficientes datos.</p>
      <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
        Hacen falta altas posteriores al inicio de la medición
        {datos.medicionDesde && <> ({new Date(datos.medicionDesde).toLocaleDateString('es-AR')})</>}
        {' '}y que haya pasado al menos una semana desde el alta.
      </p>
    </div>
  )
}
