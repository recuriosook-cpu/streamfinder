import type { SupabaseClient } from '@supabase/supabase-js'
import { LANZAMIENTO, type Rango } from '@/lib/potion-panel'

/**
 * Las compras del juego para `/admin/potion`, de `potion_compras` (proyecto
 * de Supabase del juego).
 *
 * La tabla la llena la función `verificar-compra` del juego
 * (`botellas/servidor/compras.sql`): una fila por token de compra, con su
 * estado según Google o Apple. No guarda cuánto se cobró.
 *
 * ── Los dólares son ESTIMADOS ─────────────────────────────────────────────
 *
 * Se usa el precio BASE en dólares de cada producto, el que se carga en Play
 * Console (`botellas/src/game/paquetes.ts`, `beneficios.ts` y
 * `PRECIO_DEL_PASE` en `compras.ts`). Lo cobrado de verdad cambia por país y
 * moneda, y la tienda se queda con su comisión. Si un precio cambia allá, hay
 * que cambiarlo acá.
 *
 * ── Qué es una compra válida ──────────────────────────────────────────────
 *
 * El mismo criterio que la consulta de ventas de `compras.sql`: pago único
 * `pagada`, o suscripción activa, cancelada (pagó y no renueva) o en período
 * de gracia. Además cuenta la suscripción vencida que tiene `vence`: cobró
 * hasta esa fecha. No cuentan `invalida`, `pendiente` ni `cancelada` de pago
 * único (reembolsada o revocada).
 *
 * ── La suscripción ────────────────────────────────────────────────────────
 *
 * Es UNA fila aunque se renueve (el token no cambia). Los meses cobrados se
 * estiman de `primera_vez` a `vence` (un cobro al empezar cada mes que cae
 * antes de `vence`), y cada uno cae en su día: el primero el
 * día de la compra, el segundo un mes después, etc. Así un rango de 7 días
 * cuenta la renovación de esa semana y no la compra de hace tres meses.
 *
 * Las de prueba (`prueba = true`: probadores de licencias de Google, sandbox
 * de Apple) no se cobraron y van aparte, con el mismo cálculo.
 *
 * Días de Argentina, por `primera_vez` (cuándo se verificó la compra).
 */

/** Precio base en dólares por identificador de producto (el de Android, sin `ios.`). */
export const PRECIO_USD: Record<string, number> = {
  combo_inicio: 0.99,
  combo_oficial: 4.99,
  combo_boticario: 9.99,
  combo_maestro: 19.99,
  combo_alquimista: 49.99,
  combo_leyenda: 99.99,
  monedas_punado: 1.99,
  monedas_bolsa: 4.99,
  monedas_cofre: 9.99,
  monedas_arca: 19.99,
  monedas_tesoro: 49.99,
  pase_premium: 2.99,
  suscripcion_mensual: 4.99,
}

const SUSCRIPCION = 'suscripcion_mensual'

const ESTADOS_VALIDOS = new Set([
  'pagada',
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_CANCELED',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'APPLE_ACTIVA',
  'APPLE_PERIODO_DE_GRACIA',
])

const ESTADOS_VENCIDA = new Set(['SUBSCRIPTION_STATE_EXPIRED', 'APPLE_VENCIDA'])

export interface FilaCompra {
  producto: string
  estado: string
  prueba: boolean
  vence: string | null
  primera_vez: string
  tienda: string
}

export interface ComprasPorProducto {
  producto: string
  /** Cobros: una compra, o un mes de suscripción. */
  compras: number
  /** `null` si el producto no tiene precio conocido. */
  usd: number | null
}

export interface ComprasPorDia {
  /** `YYYY-MM-DD`, día de Argentina. */
  dia: string
  compras: number
  usd: number
}

export interface ResumenCompras {
  compras: number
  usd: number
  porProducto: ComprasPorProducto[]
  porDia: ComprasPorDia[]
}

export interface PotionCompras {
  disponible: boolean
  motivo: 'sin_configurar' | 'error' | null
  reales: ResumenCompras
  prueba: ResumenCompras
  /** Filas reales del rango que no cuentan: inválidas, pendientes, reembolsadas. */
  noValidas: number
  /** Productos sin precio en `PRECIO_USD`: sus cobros suman 0 dólares. */
  sinPrecio: string[]
  generadoEn: string
}

const PAGINA = 1000

/** Igual que en `lib/potion-usuarios.ts`: Argentina no tiene horario de verano. */
function diaAR(ms: number): string {
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
}

function restarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function esValida(f: FilaCompra): boolean {
  if (ESTADOS_VALIDOS.has(f.estado)) return true
  return f.producto === SUSCRIPCION && ESTADOS_VENCIDA.has(f.estado) && f.vence !== null
}

/** Los instantes en que se cobró: uno, o uno por mes de suscripción. */
function cobros(f: FilaCompra, ahora: number): number[] {
  const inicio = Date.parse(f.primera_vez)
  if (!Number.isFinite(inicio)) return []
  if (f.producto !== SUSCRIPCION || !f.vence) return [inicio]

  // Un cobro al empezar cada mes pagado: los que caen antes de `vence` y ya pasaron.
  const vence = Date.parse(f.vence)
  if (!Number.isFinite(vence)) return [inicio]
  const r = [inicio]
  for (let k = 1; k < 120; k++) {
    const d = new Date(inicio)
    d.setUTCMonth(d.getUTCMonth() + k)
    const t = d.getTime()
    if (t >= vence || t > ahora) break
    r.push(t)
  }
  return r
}

const redondear = (usd: number) => Math.round(usd * 100) / 100

function resumir(filas: FilaCompra[], desde: number | null, ahora: number, sinPrecio: Set<string>): ResumenCompras {
  const productos = new Map<string, { compras: number; usd: number | null }>()
  const dias = new Map<string, { compras: number; usd: number }>()
  let compras = 0
  let usd = 0

  for (const f of filas) {
    const precio = PRECIO_USD[f.producto]
    if (precio === undefined) sinPrecio.add(f.producto)
    for (const t of cobros(f, ahora)) {
      if (desde !== null && t < desde) continue
      compras++
      usd += precio ?? 0

      const p = productos.get(f.producto) ?? { compras: 0, usd: precio === undefined ? null : 0 }
      p.compras++
      if (p.usd !== null) p.usd += precio ?? 0
      productos.set(f.producto, p)

      const dia = diaAR(t)
      const d = dias.get(dia) ?? { compras: 0, usd: 0 }
      d.compras++
      d.usd += precio ?? 0
      dias.set(dia, d)
    }
  }

  return {
    compras,
    usd: redondear(usd),
    porProducto: [...productos]
      .map(([producto, p]) => ({ producto, compras: p.compras, usd: p.usd === null ? null : redondear(p.usd) }))
      .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0) || b.compras - a.compras),
    porDia: [...dias]
      .map(([dia, d]) => ({ dia, compras: d.compras, usd: redondear(d.usd) }))
      .sort((a, b) => b.dia.localeCompare(a.dia)),
  }
}

export function comprasVacias(motivo: PotionCompras['motivo']): PotionCompras {
  const vacio: ResumenCompras = { compras: 0, usd: 0, porProducto: [], porDia: [] }
  return {
    disponible: false, motivo, reales: vacio, prueba: vacio, noValidas: 0, sinPrecio: [],
    generadoEn: new Date().toISOString(),
  }
}

/**
 * Baja las filas de `potion_compras` (paginando) y las resume para el rango.
 * `null` si la consulta falla; el detalle va al log con `etiqueta`.
 */
export async function calcularCompras(
  potion: SupabaseClient,
  rango: Rango,
  desdeLanzamiento: boolean,
  etiqueta: string,
): Promise<PotionCompras | null> {
  const filas: FilaCompra[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await potion
      .from('potion_compras')
      .select('producto, estado, prueba, vence, primera_vez, tienda')
      .order('primera_vez', { ascending: true })
      .order('token', { ascending: true })
      .range(desde, desde + PAGINA - 1)
    if (error) {
      console.error(`[${etiqueta}] potion_compras falló:`, error.message)
      return null
    }
    filas.push(...((data ?? []) as FilaCompra[]))
    if (!data || data.length < PAGINA) break
  }

  const ahora = Date.now()
  const hoy = diaAR(ahora)
  const inicioRango =
    rango === 'hoy' ? Date.parse(`${hoy}T00:00:00-03:00`) :
    rango === '7d' ? Date.parse(`${restarDias(hoy, 6)}T00:00:00-03:00`) :
    null
  const lanzamiento = desdeLanzamiento ? Date.parse(LANZAMIENTO) : null
  const desde =
    inicioRango === null ? lanzamiento :
    lanzamiento === null ? inicioRango :
    Math.max(inicioRango, lanzamiento)

  const validas = filas.filter(esValida)
  const sinPrecio = new Set<string>()

  // Las no válidas se cuentan por su primera vez: no tienen cobros.
  const noValidas = filas.filter(f => {
    if (f.prueba || esValida(f)) return false
    const t = Date.parse(f.primera_vez)
    return desde === null || t >= desde
  }).length

  return {
    disponible: true,
    motivo: null,
    reales: resumir(validas.filter(f => !f.prueba), desde, ahora, sinPrecio),
    prueba: resumir(validas.filter(f => f.prueba), desde, ahora, sinPrecio),
    noValidas,
    sinPrecio: [...sinPrecio].sort(),
    generadoEn: new Date().toISOString(),
  }
}
