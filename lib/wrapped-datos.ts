import { cache } from 'react'
import { createServerClient } from './supabase-server'
import { nombresDePlataformas } from './nombres-plataformas'
import { GENRE_NAMES } from '@/app/generos/[id]/genre-constants'
import { GENEROS_EN } from './generos-en'
import type { Idioma } from './idioma'
import {
  armarTarjetas, textosWrapped,
  type WrappedPerfil, type WrappedRespuesta, type WrappedVista,
} from './wrapped'

export type WrappedCarga =
  | { estado: 'no-existe' }
  | { estado: 'sin-wrapped'; perfil: WrappedPerfil; total: number }
  | { estado: 'ok'; vista: WrappedVista }

/**
 * El Wrapped de `usuario` en `anio`, listo para dibujar. Va como visitante
 * (anon): `wrapped_anual` devuelve NULL si el usuario oculta su actividad o
 * está bloqueado, y eso acá es `no-existe`, igual que un @ que no existe.
 *
 * `cache` de React: la página y su metadata lo piden una sola vez.
 */
export const cargarWrapped = cache(async (usuario: string, anio: number, idioma: Idioma): Promise<WrappedCarga> => {
  const supabase = createServerClient()
  // Sólo columnas públicas: como visitante, `*` falla (permisos por columna en profiles).
  const { data: perfil } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('username', usuario)
    .maybeSingle<WrappedPerfil>()
  if (!perfil?.username) return { estado: 'no-existe' }

  const { data, error } = await supabase.rpc('wrapped_anual', { p_user: perfil.id, p_anio: anio })
  if (error) throw new Error(`wrapped_anual: ${error.message}`)
  const datos = data as WrappedRespuesta | null
  if (!datos) return { estado: 'no-existe' }
  if (!datos.hay_wrapped) return { estado: 'sin-wrapped', perfil, total: datos.total }

  const t = textosWrapped(idioma)
  const genero = datos.genero_id != null
    ? (idioma === 'en' ? GENEROS_EN : GENRE_NAMES)[datos.genero_id] ?? null
    : null
  const plataforma = datos.plataforma_id != null
    ? (await nombresDePlataformas([datos.plataforma_id]).catch(() => []))[0] ?? null
    : null

  // El número grande son las películas; si sólo vio series, las series.
  const soloSeries = datos.peliculas === 0
  const numero = soloSeries ? datos.series : datos.peliculas
  return {
    estado: 'ok',
    vista: {
      perfil,
      datos,
      numero,
      numeroDice: soloSeries ? t.series(numero) : t.peliculas(numero),
      numeroExtra: !soloSeries && datos.series > 0 ? t.ySeries(datos.series) : null,
      tarjetas: armarTarjetas(datos, idioma, { genero, plataforma }),
    },
  }
})
