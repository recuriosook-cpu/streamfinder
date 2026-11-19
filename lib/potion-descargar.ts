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
 * persona tocó desde dos aparatos con la misma cuenta. Los robots (`is_bot`)
 * no cuentan.
 *
 * Lee `analytics_events` directo: este evento no está en la lista de masivos
 * de `analytics_limpiar`, así que se guarda 60 días y alcanza para la ventana.
 */

const ZONA = 'America/Argentina/Buenos_Aires'
const DIAS = 30
const PAGINA = 1000

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

export interface DescargarPotion {
  disponible: boolean
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
  props: { dispositivo?: string; desde?: string } | null
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
    disponible: false, dias: [], ventana: { android: 0, ios: 0, desktop: 0, total: 0 },
    medidoDesde: null, inicioVentana: '', generadoEn: new Date().toISOString(),
  }

  // Un día de colchón para la zona: se recorta por día de Argentina abajo.
  const desdeIso = new Date(Date.now() - (DIAS + 1) * 86_400_000).toISOString()

  const filas: Fila[] = []
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await admin
      .from('analytics_events')
      .select('created_at, user_id, anon_id, props')
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
