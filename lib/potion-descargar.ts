import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cuántas personas tocaron Potion Bottle en glynbox.com/descargar, por día
 * (de Argentina) y por aparato: Android, iPhone y computadora. Los últimos 30
 * días. Lo muestra `/admin/potion` por `/api/admin/potion/descargar`.
 *
 * Cuenta el evento `descargar_potion_clicked`, que mandan el banner y el
 * botón "Jugar" de la sección del juego, los badges que se despliegan en la
 * computadora y la tira de la primera pantalla (ver `lib/analytics-events.ts`).
 *
 * "Persona" es el usuario de Glynbox si estaba logueado y si no el `anon_id`
 * del navegador: alguien que toca la tira y después "Jugar" el mismo día es
 * una sola. El total del día no es la suma de las tres columnas si la misma
 * persona tocó desde dos aparatos con la misma cuenta.
 *
 * ── Lo que no cuenta ─────────────────────────────────────────────────────────
 *
 *   - Robots (`is_bot`). Desde el 19/11 incluye los navegadores automatizados
 *     (`navigator.webdriver`: Puppeteer, Playwright), aunque se hagan pasar
 *     por un celular.
 *   - Pruebas automáticas de antes de esa marca: `PRUEBAS_AUTOMATICAS`.
 *   - Sesiones de admin: un navegador que alguna vez abrió `/admin` o usó la
 *     cuenta del dueño.
 *   - Aparatos del dueño: los que llevan `propio` (ver `marcarAparatoPropio`
 *     en `lib/analytics.ts`) y los de `APARATOS_PROPIOS`.
 *
 * Se descarta el navegador entero, no sólo el evento. Cuántos se fueron por
 * cada motivo va en `descartados`.
 *
 * Lee `analytics_events` directo: este evento no está en la lista de masivos
 * de `analytics_limpiar`, así que se guarda 60 días y alcanza para la ventana.
 */

const ZONA = 'America/Argentina/Buenos_Aires'
const DIAS = 30
const PAGINA = 1000
const DUENO = 'Ferlageok'

/**
 * Corridas de pruebas automáticas contra producción de antes de que el sitio
 * marcara `navigator.webdriver` (19/11). Cuenta como prueba un navegador cuyos
 * eventos caen TODOS adentro de la ventana: uno que volvió otro día es una
 * persona (o un aparato del dueño, que se ve aparte).
 */
const PRUEBAS_AUTOMATICAS: { desde: string; hasta: string; que: string }[] = [
  // Las capturas de 623b6a9 y cbc2e8d (sección y tira de Potion), con
  // Puppeteer haciéndose pasar por un Pixel, un iPhone y una compu.
  { desde: '2026-11-16T19:10:00Z', hasta: '2026-11-16T20:05:00Z', que: 'capturas del 16/11 con Puppeteer' },
]

/**
 * Navegadores del dueño de antes de la marca `propio`. Se reconocen por la
 * forma, no por una marca, así que van con el porqué:
 *   - a61a0013: abrió /descargar 15 veces desde el 27/10 y ninguna otra
 *     página; el 16/11 tocó la tira a los minutos de publicarla.
 *   - 2e9244d8: iPhone de Argentina que tocó "Jugar" de iPhone tres veces en
 *     16 horas, la primera durante las pruebas del 16/11.
 */
const APARATOS_PROPIOS = new Set([
  'a61a0013-4e71-4025-abfb-19d55400ea1a',
  '2e9244d8-d073-4fc1-8f2e-462e67f15ddf',
])

export type AparatoDescargar = 'android' | 'ios' | 'desktop'
const APARATOS: AparatoDescargar[] = ['android', 'ios', 'desktop']

export interface DiaDescargarPotion {
  /** `YYYY-MM-DD` de Argentina. */
  dia: string
  android: number
  ios: number
  desktop: number
  /** Personas distintas del día, entre los tres aparatos. */
  total: number
  /** De esas, cuántas tocaron la tira de arriba (y no sólo la sección). */
  tira: number
}

/** El primer toque de una persona en un día y aparato: para cruzar con el juego. */
export interface ToqueDescargar {
  dia: string
  aparato: AparatoDescargar
  /** ISO. */
  en: string
  pais: string | null
}

export interface DescargarPotion {
  disponible: boolean
  /** Navegadores que tocaron pero no cuentan, por motivo. */
  descartados: { automaticas: number; admin: number; propios: number }
  /** Personas que quedan en la ventana, igual que `ventana.total`. */
  quedan: number
  toques: ToqueDescargar[]
  /** Más nuevo primero, desde el primer día medido hasta hoy, sin huecos. */
  dias: DiaDescargarPotion[]
  /** Personas distintas en toda la ventana (no la suma de los días). */
  ventana: Record<AparatoDescargar, number> & { total: number }
  /**
   * El primer día de la ventana con el evento. Mientras sea posterior a
   * `inicioVentana`, es el día en que se empezó a medir. `null` si no hay ninguno.
   */
  medidoDesde: string | null
  /** El primer día de los 30. */
  inicioVentana: string
  generadoEn: string
}

interface Fila {
  created_at: string
  user_id: string | null
  anon_id: string | null
  country: string | null
  props: { dispositivo?: string; desde?: string; propio?: boolean } | null
}

type Motivo = 'automaticas' | 'admin' | 'propios'

/**
 * Por qué no cuenta cada navegador que tocó. Mira toda su historia, no sólo
 * los toques: el admin y la marca `propio` pueden estar en otro evento.
 */
async function descartar(admin: SupabaseClient, filas: Fila[]): Promise<Map<string, Motivo> | { error: string }> {
  const motivos = new Map<string, Motivo>()
  const anons = [...new Set(filas.map(f => f.anon_id).filter((a): a is string => !!a))]
  for (const a of anons) if (APARATOS_PROPIOS.has(a)) motivos.set(a, 'propios')
  for (const f of filas) if (f.anon_id && f.props?.propio === true) motivos.set(f.anon_id, 'propios')

  const { data: perfil } = await admin.from('profiles').select('id').eq('username', DUENO).maybeSingle()
  const duenoId = (perfil as { id: string } | null)?.id ?? null
  for (const f of filas) if (f.anon_id && duenoId && f.user_id === duenoId) motivos.set(f.anon_id, 'admin')

  type Ev = { anon_id: string; created_at: string; user_id: string | null; path: string | null; props: { propio?: boolean } | null }
  const eventos: Ev[] = []
  for (let i = 0; i < anons.length; i += 100) {
    const lote = anons.slice(i, i + 100)
    for (let pagina = 0; ; pagina++) {
      const { data, error } = await admin.from('analytics_events')
        .select('anon_id, created_at, user_id, path, props')
        .in('anon_id', lote)
        .order('created_at', { ascending: true })
        .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1)
      if (error) return { error: error.message }
      eventos.push(...((data ?? []) as Ev[]))
      if (!data || data.length < PAGINA) break
    }
  }

  const rango = new Map<string, [string, string]>()
  for (const e of eventos) {
    const r = rango.get(e.anon_id)
    if (!r) rango.set(e.anon_id, [e.created_at, e.created_at])
    else { if (e.created_at < r[0]) r[0] = e.created_at; if (e.created_at > r[1]) r[1] = e.created_at }
    if ((e.path ?? '').startsWith('/admin') || (duenoId && e.user_id === duenoId)) {
      if (!motivos.has(e.anon_id) || motivos.get(e.anon_id) === 'propios') motivos.set(e.anon_id, 'admin')
    } else if (e.props?.propio === true && !motivos.has(e.anon_id)) {
      motivos.set(e.anon_id, 'propios')
    }
  }
  for (const [a, [desde, hasta]] of rango) {
    if (motivos.has(a)) continue
    const d = Date.parse(desde), h = Date.parse(hasta)
    if (PRUEBAS_AUTOMATICAS.some(p => d >= Date.parse(p.desde) && h <= Date.parse(p.hasta))) motivos.set(a, 'automaticas')
  }
  return motivos
}

const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONA })

/** `YYYY-MM-DD` anterior. Las fechas sin hora se manejan en UTC, sin zona. */
function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export async function contarDescargarPotion(admin: SupabaseClient): Promise<DescargarPotion> {
  const vacio: DescargarPotion = {
    disponible: false, descartados: { automaticas: 0, admin: 0, propios: 0 }, quedan: 0, toques: [], dias: [], ventana: { android: 0, ios: 0, desktop: 0, total: 0 },
    medidoDesde: null, inicioVentana: '', generadoEn: new Date().toISOString(),
  }

  // Un día de colchón para la zona: se recorta por día de Argentina abajo.
  const desdeIso = new Date(Date.now() - (DIAS + 1) * 86_400_000).toISOString()

  const filas: Fila[] = []
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await admin
      .from('analytics_events')
      .select('created_at, user_id, anon_id, country, props')
      .eq('name', 'descargar_potion_clicked')
      .gte('created_at', desdeIso)
      .or('is_bot.is.null,is_bot.eq.false')
      .order('created_at', { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1)
    if (error) {
      console.error('[admin/potion/descargar] la consulta falló:', error.message)
      return vacio
    }
    filas.push(...((data ?? []) as Fila[]))
    if (!data || data.length < PAGINA) break
  }

  const motivos = await descartar(admin, filas)
  if (!(motivos instanceof Map)) {
    console.error('[admin/potion/descargar] no se pudo revisar quién descartar:', motivos.error)
    return vacio
  }
  const descartadosEnVentana: Record<Motivo, Set<string>> = { automaticas: new Set(), admin: new Set(), propios: new Set() }
  const toques = new Map<string, ToqueDescargar>()

  const hoy = diaDe(new Date().toISOString())
  let primero = hoy
  for (let i = 1; i < DIAS; i++) primero = diaAnterior(primero)

  type Conjuntos = Record<AparatoDescargar | 'total' | 'tira', Set<string>>
  const nuevo = (): Conjuntos => ({
    android: new Set(), ios: new Set(), desktop: new Set(), total: new Set(), tira: new Set(),
  })
  const porDia = new Map<string, Conjuntos>()
  const ventana = nuevo()
  let medidoDesde: string | null = null

  for (const f of filas) {
    const dia = diaDe(f.created_at)
    if (dia < primero) continue
    const persona = f.user_id ?? f.anon_id
    if (!persona) continue
    const aparato = f.props?.dispositivo as AparatoDescargar | undefined
    if (!aparato || !APARATOS.includes(aparato)) continue
    const motivo = f.anon_id ? motivos.get(f.anon_id) : undefined
    if (motivo) { descartadosEnVentana[motivo].add(f.anon_id!); continue }
    const clave = `${persona}|${dia}|${aparato}`
    if (!toques.has(clave)) toques.set(clave, { dia, aparato, en: f.created_at, pais: f.country ?? null })

    if (!medidoDesde || dia < medidoDesde) medidoDesde = dia
    const c = porDia.get(dia) ?? nuevo()
    c[aparato].add(persona)
    c.total.add(persona)
    if (f.props?.desde === 'tira') c.tira.add(persona)
    porDia.set(dia, c)
    ventana[aparato].add(persona)
    ventana.total.add(persona)
  }

  const dias: DiaDescargarPotion[] = []
  if (medidoDesde) {
    for (let dia = hoy; dia >= medidoDesde; dia = diaAnterior(dia)) {
      const c = porDia.get(dia)
      dias.push({
        dia,
        android: c?.android.size ?? 0,
        ios: c?.ios.size ?? 0,
        desktop: c?.desktop.size ?? 0,
        total: c?.total.size ?? 0,
        tira: c?.tira.size ?? 0,
      })
    }
  }

  const resultado: DescargarPotion = {
    disponible: true,
    descartados: {
      automaticas: descartadosEnVentana.automaticas.size,
      admin: descartadosEnVentana.admin.size,
      propios: descartadosEnVentana.propios.size,
    },
    quedan: ventana.total.size,
    toques: [...toques.values()],
    dias,
    ventana: {
      android: ventana.android.size, ios: ventana.ios.size, desktop: ventana.desktop.size, total: ventana.total.size,
    },
    medidoDesde,
    inicioVentana: primero,
    generadoEn: new Date().toISOString(),
  }
  return resultado
}
