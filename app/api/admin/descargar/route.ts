import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'
import { DISPOSITIVOS, esDispositivo, type Dispositivo } from '@/lib/device'
import {
  VENTANA_POR_DEFECTO,
  esVentana,
  type Ventana,
} from '@/lib/analytics-descargar'

/**
 * GET /api/admin/descargar?dias=7|30
 *
 * Todo lo que el panel muestra de la landing `/descargar`: el embudo de
 * visitas → clicks → registros, el tiempo y las páginas por sesión, y el mismo
 * corte abierto por dispositivo.
 *
 * ── Por qué es un endpoint y no una consulta desde el panel ────────────────
 *
 * Porque `analytics_events` no se puede leer desde el navegador, y con razón.
 * `supabase-analytics-actividad.sql` le revoca los permisos a `anon` y a
 * `authenticated` explícitamente: la anon key viaja en el bundle, así que
 * cualquiera que la lea podría sacar la actividad de todos los usuarios. El
 * panel consulta Supabase desde el cliente para casi todo, pero para esto no
 * puede. La service role vive acá y no sale del servidor.
 *
 * ── Por qué son dos RPC y no veinte conteos ────────────────────────────────
 *
 * La versión anterior de este archivo pedía nueve `count(*)` con `head: true`,
 * uno por combinación de dispositivo y destino. Servía mientras lo único que
 * había que contar fueran eventos sueltos.
 *
 * Ya no alcanza, por dos motivos:
 *
 *   1. **El registro no es un evento de esta pantalla.** Ocurre en el
 *      onboarding, y sólo se le puede atribuir a la landing mirando la sesión
 *      entera. Eso es un GROUP BY, y PostgREST no agrupa.
 *   2. **La unidad pasó a ser la sesión.** Contando eventos, alguien que toca
 *      el botón tres veces daba 300% de conversión sobre su propia visita.
 *
 * Así que el agregado vive en SQL (`supabase-analytics-descargar.sql`) y acá
 * sólo se llaman dos funciones y se arma el JSON. La alternativa —bajarse las
 * sesiones y promediar en JavaScript— funciona hoy y se rompe sola el día que
 * una campaña buena deje cien mil filas.
 *
 * ── Los bots ──────────────────────────────────────────────────────────────
 *
 * El filtro `is_bot = false` está adentro de la vista, así que no hay forma de
 * olvidárselo desde acá. En una página que se promociona con links públicos no
 * es un detalle: los previsualizadores de WhatsApp, Twitter y Facebook la
 * visitan cada vez que alguien comparte el link.
 *
 * ── Si el SQL todavía no se corrió ─────────────────────────────────────────
 *
 * El SQL de este proyecto se aplica a mano en el editor de Supabase, así que el
 * código puede estar desplegado antes que las funciones existan. En ese caso
 * Postgres devuelve 42883 / PGRST202 y acá se contesta `disponible: false` con
 * `motivo: 'sin_migracion'`, para que el panel diga qué falta en vez de
 * mostrar un panel vacío que parece un bug.
 */

export const runtime = 'nodejs'

// ── Auth ───────────────────────────────────────────────────────────────────

/** Mismo criterio que `app/admin/layout.tsx` y `/api/admin/overview`. */
async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options) } catch { /**/ } }) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  return profile?.username === 'Ferlageok' ? user : null
}

// ── Ventanas ───────────────────────────────────────────────────────────────

/**
 * La ventana pedida, o la de por defecto.
 *
 * La lista de ventanas válidas vive en `lib/analytics-descargar.ts`, compartida
 * con el panel: ahí está el porqué.
 */
function leerVentana(req: NextRequest): Ventana {
  const crudo = Number(req.nextUrl.searchParams.get('dias'))
  return esVentana(crudo) ? crudo : VENTANA_POR_DEFECTO
}

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface FilaDispositivo {
  dispositivo: Dispositivo
  /** Sesiones que llegaron a la landing con este aparato. */
  visitas: number
  /** Sesiones que se fueron a Play Store. */
  aPlayStore: number
  /** Sesiones que entraron al sitio. */
  aWeb: number
  /** Sesiones con al menos un click, a donde sea. No es la suma de las dos de arriba. */
  clicks: number
  /** Sesiones que terminaron registrándose. */
  registros: number
  /**
   * Clicks sobre visitas, en porcentaje.
   *
   * `null` cuando no hubo visitas: no existe el porcentaje de conversión sobre
   * cero, y mostrar 0% ahí diría "nadie tocó el botón" cuando lo que pasa es
   * que nadie llegó.
   */
  conversionPct: number | null
}

export interface PasoEmbudo {
  clave: 'visitas' | 'clicks' | 'registros'
  etiqueta: string
  valor: number
  /** Sobre el total de visitas. El primer paso es siempre 100. */
  pctSobreVisitas: number | null
  /** Sobre el paso anterior. `null` en el primero. */
  pctSobreAnterior: number | null
}

export interface DescargarResumen {
  /** `false` si falta correr el SQL o si todavía no entró ninguna sesión. */
  disponible: boolean
  motivo: 'sin_migracion' | 'sin_datos' | null
  /** La ventana efectivamente aplicada. */
  dias: Ventana
  /** Primera sesión registrada, sin ventana. Para saber desde cuándo medimos. */
  desde: string | null

  embudo: {
    pasos: PasoEmbudo[]
    /** Reparto del paso del medio. Un click es a Play Store o al sitio. */
    aPlayStore: number
    aWeb: number
    /** Registros sobre los que entraron al sitio, que es el paso real anterior. */
    registrosSobreWebPct: number | null
  }

  sesion: {
    /** Promedio de duración, en segundos. `null` sin sesiones. */
    segundosPromedio: number | null
    /** Promedio de páginas vistas. `null` sin sesiones. */
    vistasPromedio: number | null
  }

  porDispositivo: FilaDispositivo[]
  generadoEn: string
}

// ── Formas que devuelve el SQL ─────────────────────────────────────────────

interface FilaResumen {
  visitas: number
  con_click: number
  con_click_play: number
  con_click_web: number
  registros: number
  segundos_promedio: number | null
  vistas_promedio: number | null
  primera: string | null
}

interface FilaDispositivoSql {
  dispositivo: string
  visitas: number
  con_click_play: number
  con_click_web: number
  registros: number
}

// ── Ayudas ─────────────────────────────────────────────────────────────────

function porcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((parte / total) * 1000) / 10
}

function vacio(dias: Ventana, motivo: 'sin_migracion' | 'sin_datos'): DescargarResumen {
  return {
    disponible: false,
    motivo,
    dias,
    desde: null,
    embudo: { pasos: [], aPlayStore: 0, aWeb: 0, registrosSobreWebPct: null },
    sesion: { segundosPromedio: null, vistasPromedio: null },
    porDispositivo: [],
    generadoEn: new Date().toISOString(),
  }
}

/**
 * ¿El error es "la función no existe"?
 *
 * Postgres tira 42883 (undefined_function) y PostgREST lo envuelve como
 * PGRST202 cuando no encuentra la función en su cache de esquema. Se miran los
 * dos códigos y, como último recurso, el texto: la respuesta exacta depende de
 * la versión de PostgREST y esto no puede fallar justo cuando su único trabajo
 * es explicar qué falta.
 */
function faltaLaMigracion(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42883' || error.code === 'PGRST202') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('could not find the function') || msg.includes('does not exist')
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/descargar')
  if (failure) return failure

  const dias = leerVentana(req)

  const [resumenRes, dispositivosRes] = await Promise.all([
    admin.rpc('analytics_descargar_resumen', { p_dias: dias }),
    admin.rpc('analytics_descargar_dispositivos', { p_dias: dias }),
  ])

  if (faltaLaMigracion(resumenRes.error) || faltaLaMigracion(dispositivosRes.error)) {
    console.warn('[admin/descargar] falta correr supabase-analytics-descargar.sql')
    return NextResponse.json(vacio(dias, 'sin_migracion'))
  }

  if (resumenRes.error || dispositivosRes.error) {
    console.error(
      '[admin/descargar] consulta falló:',
      resumenRes.error?.message ?? dispositivosRes.error?.message
    )
    return NextResponse.json(vacio(dias, 'sin_datos'))
  }

  // La función de resumen es un agregado sin GROUP BY: siempre devuelve
  // exactamente una fila, aunque esté toda en cero. Que venga vacía sería un
  // caso imposible, pero no se asume.
  const fila = (resumenRes.data as FilaResumen[] | null)?.[0]
  if (!fila || fila.visitas === 0) {
    const sinDatos = vacio(dias, 'sin_datos')
    // La fecha de la primera sesión sí se conserva: que no haya nada en los
    // últimos 7 días no significa que no se esté midiendo.
    sinDatos.desde = fila?.primera ?? null
    return NextResponse.json(sinDatos)
  }

  const visitas   = Number(fila.visitas)
  const clicks    = Number(fila.con_click)
  const aPlay     = Number(fila.con_click_play)
  const aWeb      = Number(fila.con_click_web)
  const registros = Number(fila.registros)

  const pasos: PasoEmbudo[] = [
    {
      clave: 'visitas',
      etiqueta: 'Visitas',
      valor: visitas,
      pctSobreVisitas: 100,
      pctSobreAnterior: null,
    },
    {
      clave: 'clicks',
      etiqueta: 'Tocaron un botón',
      valor: clicks,
      pctSobreVisitas: porcentaje(clicks, visitas),
      pctSobreAnterior: porcentaje(clicks, visitas),
    },
    {
      clave: 'registros',
      etiqueta: 'Se registraron',
      valor: registros,
      pctSobreVisitas: porcentaje(registros, visitas),
      pctSobreAnterior: porcentaje(registros, clicks),
    },
  ]

  // Se recorre `DISPOSITIVOS` y no lo que devolvió el SQL, para que el orden de
  // la tabla sea siempre el mismo y para que un aparato sin sesiones aparezca
  // en cero en vez de desaparecer de la tabla.
  const porSql = new Map<string, FilaDispositivoSql>(
    ((dispositivosRes.data as FilaDispositivoSql[] | null) ?? []).map(f => [f.dispositivo, f])
  )

  const porDispositivo: FilaDispositivo[] = DISPOSITIVOS.map(dispositivo => {
    const f = porSql.get(dispositivo)
    const visitasD = Number(f?.visitas ?? 0)
    const playD    = Number(f?.con_click_play ?? 0)
    const webD     = Number(f?.con_click_web ?? 0)
    // No es play + web: una misma sesión pudo tocar los dos botones, y sumarlos
    // la contaría dos veces. Se reconstruye con el máximo, que es la cota justa
    // que se puede afirmar sin volver a consultar por dispositivo.
    const clicksD  = Math.max(playD, webD)
    return {
      dispositivo,
      visitas: visitasD,
      aPlayStore: playD,
      aWeb: webD,
      clicks: clicksD,
      registros: Number(f?.registros ?? 0),
      conversionPct: porcentaje(clicksD, visitasD),
    }
  })

  // Un aparato que el SQL trajo y que no está en la lista conocida
  // ('desconocido', o uno nuevo que todavía no exista en `lib/device.ts`) no se
  // pierde en silencio: se avisa por log. No se muestra en la tabla porque no
  // hay etiqueta para él, pero sí está contado en los totales del embudo.
  for (const clave of porSql.keys()) {
    if (!esDispositivo(clave)) {
      console.warn('[admin/descargar] dispositivo fuera de catálogo:', clave)
    }
  }

  const resumen: DescargarResumen = {
    disponible: true,
    motivo: null,
    dias,
    desde: fila.primera,
    embudo: {
      pasos,
      aPlayStore: aPlay,
      aWeb,
      registrosSobreWebPct: porcentaje(registros, aWeb),
    },
    sesion: {
      segundosPromedio: fila.segundos_promedio === null ? null : Number(fila.segundos_promedio),
      vistasPromedio:   fila.vistas_promedio   === null ? null : Number(fila.vistas_promedio),
    },
    porDispositivo,
    generadoEn: new Date().toISOString(),
  }

  return NextResponse.json(resumen)
}
