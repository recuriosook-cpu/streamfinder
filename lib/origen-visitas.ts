/**
 * Los orígenes del bloque "De dónde vienen las visitas web" de
 * `/admin/metricas`. Los comparten el endpoint (`/api/admin/origen-visitas`)
 * y el panel; viven acá porque un `route.ts` de Next 16 no puede exportar
 * valores (ver `lib/metricas-ventanas.ts`).
 *
 * La clasificación la hace `analytics_origen_visitas` en SQL
 * (`supabase-origen-visitas-2026-11.sql`), con este orden de prioridad:
 * TikTok, Instagram, Facebook, WhatsApp, Google, directo, otros. Mira el
 * navegador embebido, el id de clic del anuncio, `utm_source` y el referrer
 * (dominio o package de Android). `sin_dato` es la visita sin `page_view` de
 * entrada con origen: todas las de antes del 17/11/2026.
 */

export const ORIGENES = ['tiktok', 'instagram', 'facebook', 'whatsapp', 'google', 'directo', 'otros', 'sin_dato'] as const
export type Origen = (typeof ORIGENES)[number]

export const NOMBRE_DE_ORIGEN: Record<Origen, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  google: 'Google',
  directo: 'Directo',
  otros: 'Otros',
  sin_dato: 'Sin dato',
}

/** El día en que el primer `page_view` empezó a llevar el origen. */
export const ORIGEN_DESDE = '2026-11-17'
