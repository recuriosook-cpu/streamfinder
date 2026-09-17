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
  /**
   * Una pantalla vista. props: { path }
   *
   * Uno por navegación del router, no uno por render. Es el único evento que
   * dispara alguien que sólo navega, y por eso existe: sin él una sesión de
   * veinte pantallas dejaba un solo timestamp y no se le podía calcular
   * duración. Ver `components/PageViewTracker.tsx`.
   */
  'page_view',
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

  // ── Captación de instalaciones de la app de Android ─────────────────
  //
  // Los tres primeros son el embudo de la barra inferior: se muestra, se toca,
  // se cierra. Van juntos a propósito, porque por separado no dicen nada. Un
  // conteo de clicks sin el de vistas no es una tasa de conversión, es un
  // número suelto; y sin el de cierres no se sabe si la barra molesta.
  //
  // La barra se muestra una sola vez por navegador, así que `app_banner_shown`
  // cuenta navegadores alcanzados, no impresiones. `shown` debería ser siempre
  // >= `clicked` + `dismissed`: la diferencia es la gente que la ignoró y
  // siguió leyendo, que también es información.

  /** Apareció la barra de descarga. Una vez por navegador. props: {} */
  'app_banner_shown',
  /** Tocó el botón de la barra y se fue a Play Store. props: {} */
  'app_banner_clicked',
  /** Cerró la barra con la X. props: {} */
  'app_banner_dismissed',
  /**
   * Click en el badge de Google Play del pie de página. props: { path }
   *
   * Este va aparte del embudo de la barra y no comparte prefijo por casualidad:
   * el badge está en todas las páginas y en todos los dispositivos, sin límite
   * de una vez. Mezclarlo con `app_banner_clicked` volvería inútil la tasa de
   * conversión de la barra.
   *
   * Lleva `path` porque el pie es idéntico en todo el sitio: sin eso no hay
   * forma de saber desde qué pantalla salió el click.
   */
  'app_footer_clicked',

  // ── Landing de descarga (/descargar) ────────────────────────────────
  //
  // Los dos eventos de una pantalla que no tiene otra cosa que hacer: se ve y
  // se toca un botón. Van de a pares porque el número que importa no es
  // ninguno de los dos por separado sino el cociente — cuánta de la gente que
  // llegó desde una campaña terminó yendo a algún lado.
  //
  // Los dos llevan `dispositivo` porque la página muestra botones distintos
  // según el aparato, y sin esa prop las visitas y los clicks no se podrían
  // cruzar: un click a Play Store sólo puede venir de alguien a quien se le
  // ofreció Play Store, y saber a cuántos se les ofreció es justamente el
  // denominador.
  //
  // No reemplazan al `page_view` que `PageViewTracker` dispara igual en esta
  // ruta. Ese sirve para la duración de sesión y no sabe de dispositivos; este
  // es el embudo de la landing. Cuentan cosas distintas y conviven.

  /** Se cargó /descargar. props: { dispositivo } */
  'descargar_viewed',
  /**
   * Se tocó uno de los dos botones. props: { dispositivo, destino, boton }
   *
   * `destino` es a dónde se fue ('play_store' | 'glynbox_web') y `boton` es
   * cuál de los dos tocó ('principal' | 'secundario'). Van separados porque no
   * son lo mismo: en Android el principal lleva a Play Store y en escritorio el
   * secundario lleva al mismo lado. Con una sola prop no se podría distinguir
   * "eligió lo que le propusimos" de "eligió la alternativa".
   */
  'descargar_clicked',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

const EVENT_NAME_SET: ReadonlySet<string> = new Set(EVENT_NAMES)

export function isKnownEvent(name: unknown): name is EventName {
  return typeof name === 'string' && EVENT_NAME_SET.has(name)
}

/** Valores que pueden ir dentro de `props`. Nada anidado: se aplana o se descarta. */
export type EventProps = Record<string, string | number | boolean | null>
