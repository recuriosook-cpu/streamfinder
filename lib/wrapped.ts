import type { Idioma } from './idioma'

/**
 * Glynbox Wrapped: el resumen del año de cada usuario, para compartir.
 *
 *   - Página: `/wrapped/[usuario]/[año]` y `/en/wrapped/[usuario]/[año]`
 *     (app/wrapped/[usuario]/[anio]/wrapped.tsx).
 *   - Imágenes: `/api/share/wrapped/[usuario]/[año]` (vista previa del link,
 *     o la historia con `?formato=historia`), lib/wrapped-imagen.tsx.
 *   - Datos: `wrapped_anual(p_user, p_anio)` en Supabase
 *     (supabase-wrapped-2026-11.sql), la misma que va a usar la app.
 *
 * Este archivo no importa nada del servidor: lo usa `proxy.ts`.
 */

/**
 * Desde cuándo se ve el Wrapped de cada año: el 1 de diciembre de ese año a
 * las 0 h de Buenos Aires. Antes, la página y sus imágenes dan 404 (`proxy.ts`).
 *
 * Para probar antes de tiempo, cambiar el mes y día (ej. `'11-01T00:00:00-03:00'`).
 */
export const WRAPPED_ABRE = '12-01T00:00:00-03:00'

/** El primer año con Wrapped. Los anteriores no tienen datos útiles: 404. */
export const WRAPPED_PRIMER_ANIO = 2026

/** Con menos vistas en el año no hay Wrapped (la función devuelve `hay_wrapped: false`). */
export const WRAPPED_MINIMO = 5

/** El año de la URL, o `null` si no es un año de cuatro cifras. */
export function anioDeRuta(texto: string): number | null {
  return /^\d{4}$/.test(texto) ? Number(texto) : null
}

/** ¿Ya se puede ver el Wrapped de ese año? */
export function wrappedAbierto(anio: number, ahora: Date = new Date()): boolean {
  if (!Number.isInteger(anio) || anio < WRAPPED_PRIMER_ANIO) return false
  return ahora.getTime() >= new Date(`${anio}-${WRAPPED_ABRE}`).getTime()
}

/** `/wrapped/fer/2026` o `/en/wrapped/fer/2026`. */
export function rutaWrapped(idioma: Idioma, usuario: string, anio: number): string {
  return `${idioma === 'en' ? '/en' : ''}/wrapped/${encodeURIComponent(usuario)}/${anio}`
}

/** La imagen: vista previa del link (1200 × 630) o historia (1080 × 1920). */
export function rutaImagenWrapped(
  idioma: Idioma, usuario: string, anio: number, formato: 'link' | 'historia' = 'link',
): string {
  const qs = new URLSearchParams()
  if (formato === 'historia') { qs.set('formato', 'historia'); qs.set('jpg', '1') }
  if (idioma === 'en') qs.set('lang', 'en')
  const q = qs.toString()
  return `/api/share/wrapped/${encodeURIComponent(usuario)}/${anio}${q ? `?${q}` : ''}`
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

export interface WrappedFavorita {
  media_type: 'movie' | 'tv'
  media_id: number
  titulo: string | null
  poster_path: string | null
  puntaje: number
}

/** Lo que devuelve `wrapped_anual` cuando hay Wrapped. */
export interface WrappedDatos {
  anio: number
  hay_wrapped: true
  total: number
  peliculas: number
  series: number
  minutos_peliculas: number
  episodios: number
  horas: number
  genero_id: number | null
  plataforma_id: number | null
  plataforma_titulos: number | null
  puntaje_promedio: number | null
  puntajes: number
  top_pct: number | null
  usuarios_del_anio: number
  favoritas: WrappedFavorita[]
}

export type WrappedRespuesta = WrappedDatos | { anio: number; hay_wrapped: false; total: number }

export interface WrappedPerfil {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

/** Una de las cuatro tarjetas, ya con su texto. */
export interface WrappedTarjeta {
  clave: 'genero' | 'plataforma' | 'puntaje' | 'top' | 'series' | 'notas' | 'horas'
  titulo: string
  valor: string
}

/** Todo lo que dibujan la página y las imágenes, ya resuelto. */
export interface WrappedVista {
  perfil: WrappedPerfil
  datos: WrappedDatos
  /** El número grande y lo que cuenta. */
  numero: number
  numeroDice: string
  /** "y 12 series", si corresponde. */
  numeroExtra: string | null
  tarjetas: WrappedTarjeta[]
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export function textosWrapped(idioma: Idioma) {
  const en = idioma === 'en'
  const num = (n: number, dec = 0) =>
    n.toLocaleString(en ? 'en-US' : 'es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  return {
    num,
    titulo: (anio: number) => (en ? `My ${anio} on Glynbox` : `Mi ${anio} en Glynbox`),
    tituloPagina: (nombre: string, anio: number) =>
      en ? `${nombre}'s ${anio} Glynbox Wrapped` : `Glynbox Wrapped ${anio} de ${nombre}`,
    descripcion: (n: number, dice: string, anio: number) =>
      en ? `${num(n)} ${dice} in ${anio}. How many did you watch?` : `${num(n)} ${dice} en ${anio}. ¿Y vos cuántas viste?`,
    peliculas: (n: number) => (en ? (n === 1 ? 'movie watched' : 'movies watched') : n === 1 ? 'película vista' : 'películas vistas'),
    series: (n: number) => (en ? (n === 1 ? 'series watched' : 'series watched') : n === 1 ? 'serie vista' : 'series vistas'),
    ySeries: (n: number) => (en ? `and ${num(n)} ${n === 1 ? 'series' : 'series'}` : `y ${num(n)} ${n === 1 ? 'serie' : 'series'}`),
    tarjeta: {
      genero: en ? 'Top genre' : 'Género favorito',
      plataforma: en ? 'Top platform' : 'Plataforma top',
      puntaje: en ? 'Average rating' : 'Puntaje promedio',
      top: en ? 'Film buff ranking' : 'De los más cinéfilos',
      series: en ? 'Series' : 'Series',
      notas: en ? 'Ratings given' : 'Calificaciones',
      horas: en ? 'Hours of movies' : 'Horas de películas',
    },
    favoritas: en ? 'Favorites of the year' : 'Favoritas del año',
    pie: en ? 'How many did you watch?' : '¿Y vos cuántas viste?',
    descargar: en ? 'Get Glynbox and make yours' : 'Descargá Glynbox y armá el tuyo',
    historia: en ? 'Download for stories' : 'Descargar para historias',
    verPerfil: en ? 'See profile' : 'Ver perfil',
    sinWrapped: {
      titulo: (anio: number) => (en ? `No ${anio} Wrapped yet` : `Todavía no hay Wrapped ${anio}`),
      texto: (usuario: string, total: number, anio: number) =>
        en
          ? `@${usuario} has marked ${num(total)} of ${WRAPPED_MINIMO} movies or series needed for ${anio}. The Wrapped is built from what you mark as watched during the year.`
          : `@${usuario} marcó ${num(total)} de las ${WRAPPED_MINIMO} películas o series que hacen falta en ${anio}. El Wrapped se arma con lo que marcás como visto durante el año.`,
      invitacion: en
        ? 'Is it yours? Mark what you watched on Glynbox and come back: it updates on its own.'
        : '¿Es tuyo? Marcá en Glynbox lo que viste y volvé: se actualiza solo.',
      boton: en ? 'Mark what I watched' : 'Marcar lo que vi',
    },
  }
}

/** Las tarjetas en orden; si falta alguna de las cuatro principales, se completa con las de respaldo. */
export function armarTarjetas(
  datos: WrappedDatos,
  idioma: Idioma,
  nombres: { genero: string | null; plataforma: string | null },
): WrappedTarjeta[] {
  const t = textosWrapped(idioma)
  const todas: (WrappedTarjeta | null)[] = [
    nombres.genero ? { clave: 'genero', titulo: t.tarjeta.genero, valor: nombres.genero } : null,
    nombres.plataforma ? { clave: 'plataforma', titulo: t.tarjeta.plataforma, valor: nombres.plataforma } : null,
    datos.puntaje_promedio != null
      ? // Sin la estrella: la dibuja cada uno (las fuentes de las imágenes no la tienen).
      { clave: 'puntaje', titulo: t.tarjeta.puntaje, valor: t.num(datos.puntaje_promedio, 1) }
      : null,
    datos.top_pct != null ? { clave: 'top', titulo: t.tarjeta.top, valor: `Top ${datos.top_pct}%` } : null,
    // Respaldo, en este orden.
    datos.series > 0 && datos.peliculas > 0 ? { clave: 'series', titulo: t.tarjeta.series, valor: t.num(datos.series) } : null,
    datos.puntajes > 0 ? { clave: 'notas', titulo: t.tarjeta.notas, valor: t.num(datos.puntajes) } : null,
    datos.minutos_peliculas > 0
      ? { clave: 'horas', titulo: t.tarjeta.horas, valor: `~${t.num(Math.round(datos.minutos_peliculas / 60))} h` }
      : null,
  ]
  return todas.filter((x): x is WrappedTarjeta => !!x).slice(0, 4)
}
