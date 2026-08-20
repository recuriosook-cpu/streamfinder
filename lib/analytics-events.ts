/**
 * Catálogo de eventos. Lo comparten el cliente y el endpoint de ingesta.
 *
 * Vive aparte de `lib/analytics.ts` porque `/api/track` lo necesita del lado del
 * servidor y ese módulo arrastra `localStorage`, `sessionStorage` y el cliente
 * de Supabase del navegador.
 *
 * La lista es cerrada a propósito. `/api/track` descarta en silencio cualquier
 * nombre que no esté acá: el endpoint es público —tiene que serlo, lo llama el
 * navegador de gente sin cuenta— así que sin lista blanca alcanza con que
 * alguien lo descubra para llenar la tabla de basura.
 *
 * Agregar un evento es agregarlo acá. No hay registro en otro lado.
 */

export const EVENT_NAMES = [
  /** Carga de la app. props: { logueado: boolean } */
  'app_open',
  /** Arranca un registro. props: { metodo: 'email' | 'google' | 'facebook' } */
  'signup_started',
  /** El registro se concretó. props: { metodo } */
  'signup_completed',
  /** Se mostró un paso del onboarding. props: { paso: 1-5 } */
  'onboarding_step_viewed',
  /** Avanzó de paso. props: { paso: 1-5 } */
  'onboarding_step_completed',
  /** Salteó el onboarding. props: { paso, tipo: 'boton_saltar' | 'saltar_calificacion' } */
  'onboarding_skipped',
  /** Búsqueda con cero resultados. props: { query, tipo } */
  'search_no_results',
  /** Click en una plataforma de streaming. props: { provider, media_type, media_id } */
  'provider_click',
  /** Permiso de notificaciones. props: { estado: 'pedido' | 'aceptado' | 'rechazado' } */
  'notif_permission',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

const EVENT_NAME_SET: ReadonlySet<string> = new Set(EVENT_NAMES)

export function isKnownEvent(name: unknown): name is EventName {
  return typeof name === 'string' && EVENT_NAME_SET.has(name)
}

/** Valores que pueden ir dentro de `props`. Nada anidado: se aplana o se descarta. */
export type EventProps = Record<string, string | number | boolean | null>
