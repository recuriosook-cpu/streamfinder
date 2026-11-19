/**
 * Qué decir en "Disponible en streaming" cuando en el país elegido no hay
 * plataformas. Mismas reglas que la app (glynbox-mobile, `src/lib/estrenoPais.ts`):
 *
 *   - `proximo`         → todavía no se estrenó ahí y se sabe cuándo.
 *   - `proximoSinFecha` → todavía no se estrenó y no hay fecha.
 *   - `soloCines`       → película que se estrenó en cines ahí hace poco.
 *   - `null`            → el mensaje de siempre.
 *
 * Las películas usan las fechas por país de TMDB (`release_dates`). Las series
 * no tienen fechas por país: se usa `first_air_date`, la del estreno original.
 *
 * Funciones puras y sin "hoy" implícito: el servidor arma la ficha con su
 * fecha y el navegador la recalcula con la suya (ver `StreamingSection`).
 */

export type EstadoEstreno =
  | { tipo: 'proximo'; fecha: string }
  | { tipo: 'proximoSinFecha' }
  | { tipo: 'soloCines' }
  | null

/** Una fecha de estreno de un país, ya reducida: 'AAAA-MM-DD' y el tipo de TMDB. */
export interface FechaEstreno {
  fecha: string
  /** 1 premiere (festival), 2 cines limitado, 3 cines, 4 digital, 5 físico, 6 TV. */
  type: number
}

/** Fechas de estreno por código de país. */
export type FechasPorPais = Record<string, FechaEstreno[]>

/** Lo que necesita `StreamingSection` para saber si ya se estrenó en el país. */
export type EstrenoRef =
  | { tipo: 'movie'; fechas: FechasPorPais | null; general: string | null }
  | { tipo: 'tv'; primeraEmision: string | null }

/** Días desde el estreno en cines en los que todavía decimos "solo en cines". */
export const DIAS_SOLO_CINES = 120

/** Cines (limitado y normal). */
const TIPOS_CINE = new Set([2, 3])

/**
 * Lo que cuenta como estreno para el público: cines, digital, físico o TV. Las
 * premieres de festival (tipo 1) no: verla ahí no está al alcance de nadie.
 */
const TIPO_MINIMO_PUBLICO = 2

/** El tipo de estreno digital: si ya pasó, no está "solo en cines". */
const TIPO_DIGITAL = 4

const ISO_FECHA = /^\d{4}-\d{2}-\d{2}/

/**
 * La respuesta de `/movie/{id}/release_dates` reducida a lo que se usa: sólo
 * los países pedidos y los estrenos al público. Viaja al navegador, así que
 * cuanto menos, mejor.
 */
export function reducirFechas(
  respuesta: { results?: { iso_3166_1: string; release_dates: { release_date: string; type: number }[] }[] } | null,
  paises: string[],
): FechasPorPais | null {
  if (!respuesta?.results) return null
  const quiero = new Set(paises)
  const out: FechasPorPais = {}
  for (const r of respuesta.results) {
    if (!quiero.has(r.iso_3166_1)) continue
    const fechas = (r.release_dates ?? [])
      .filter(d => d.type >= TIPO_MINIMO_PUBLICO && ISO_FECHA.test(d.release_date))
      .map(d => ({ fecha: d.release_date.slice(0, 10), type: d.type }))
    if (fechas.length) out[r.iso_3166_1] = fechas
  }
  return out
}

/** Días entre dos 'AAAA-MM-DD' (b - a). Mediodía UTC para no tropezar con el horario de verano. */
function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)
  return Math.round(ms / 86_400_000)
}

export function estadoEstrenoPelicula(
  fechas: FechasPorPais,
  pais: string,
  /** `release_date` del detalle: el estreno principal, en cualquier país. */
  estrenoGeneral: string | null | undefined,
  hoy: string,
): EstadoEstreno {
  const delPais = fechas[pais] ?? []

  if (delPais.length === 0) {
    // Sin datos del país. Si no se estrenó en ningún lado, tampoco ahí; si ya
    // se estrenó en otro lado, no sabemos nada y va el mensaje de siempre.
    const general = estrenoGeneral && ISO_FECHA.test(estrenoGeneral) ? estrenoGeneral.slice(0, 10) : null
    return !general || general > hoy ? { tipo: 'proximoSinFecha' } : null
  }

  const primera = delPais.map(d => d.fecha).sort()[0]
  if (primera > hoy) return { tipo: 'proximo', fecha: primera }

  const yaDigital = delPais.some(d => d.type === TIPO_DIGITAL && d.fecha <= hoy)
  const enCines = delPais
    .filter(d => TIPOS_CINE.has(d.type) && d.fecha <= hoy)
    .map(d => d.fecha)
    .sort()[0]
  if (enCines && !yaDigital && diasEntre(enCines, hoy) <= DIAS_SOLO_CINES) {
    return { tipo: 'soloCines' }
  }
  return null
}

export function estadoEstrenoSerie(primeraEmision: string | null | undefined, hoy: string): EstadoEstreno {
  if (!primeraEmision || !ISO_FECHA.test(primeraEmision)) return { tipo: 'proximoSinFecha' }
  const fecha = primeraEmision.slice(0, 10)
  return fecha > hoy ? { tipo: 'proximo', fecha } : null
}

/**
 * El estado para un país. Sin las fechas de la película (TMDB falló), `null`:
 * el mensaje de siempre, como en la app.
 */
export function estadoEstreno(ref: EstrenoRef, pais: string, hoy: string): EstadoEstreno {
  if (ref.tipo === 'tv') return estadoEstrenoSerie(ref.primeraEmision, hoy)
  return ref.fechas ? estadoEstrenoPelicula(ref.fechas, pais, ref.general, hoy) : null
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** '2026-12-12' → '12 de diciembre'. El año sólo si no es el de `hoy`. */
export function fechaEstreno(iso: string, hoy: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const conAnio = String(y) !== hoy.slice(0, 4)
  return `${d} de ${MESES[m - 1]}${conAnio ? ` de ${y}` : ''}`
}

/** El texto cuando no hay plataformas; `null` = el mensaje de siempre. */
export function mensajeEstreno(estado: EstadoEstreno, hoy: string): string | null {
  if (!estado) return null
  switch (estado.tipo) {
    case 'proximo':
      return `Todavía no se estrenó en tu país. Se estrena el ${fechaEstreno(estado.fecha, hoy)}.`
    case 'proximoSinFecha':
      return 'Todavía no se estrenó en tu país.'
    case 'soloCines':
      return 'Actualmente está solo en cines.'
  }
}

/**
 * Lo mismo para el bloque "Dónde ver X en Argentina" (`DondeVer`), que habla
 * de Argentina por nombre y no de "tu país". `null` = la frase de siempre.
 */
export function fraseEstrenoArgentina(estado: EstadoEstreno, titulo: string, hoy: string): string | null {
  if (!estado) return null
  switch (estado.tipo) {
    case 'proximo':
      return `${titulo} todavía no se estrenó en Argentina. Se estrena el ${fechaEstreno(estado.fecha, hoy)}.`
    case 'proximoSinFecha':
      return `${titulo} todavía no se estrenó en Argentina.`
    case 'soloCines':
      return `En Argentina, ${titulo} está actualmente solo en cines.`
  }
}

/** Hoy como 'AAAA-MM-DD' en la hora de Argentina (el país con que el servidor arma la ficha). */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}

/** Hoy como 'AAAA-MM-DD' en la hora del navegador. */
export function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
