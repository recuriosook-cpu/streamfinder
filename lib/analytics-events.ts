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
  /**
   * Carga de la app. props: { logueado: boolean, idioma? }
   *
   * `idioma` ('es' | 'en') lo manda sólo la app nativa, desde el 25/10: el
   * idioma en que se muestra en ese arranque (el del teléfono o el elegido en
   * Ajustes). Es por instalación, a diferencia de `profiles.idioma`, que es
   * por cuenta y no cubre a quien no tiene una. Lo cuenta el bloque "Idioma
   * de la app" de `/admin/metricas`.
   */
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
  /**
   * Arranca un registro. props: { metodo: 'email' | 'google' | 'apple' | 'facebook',
   * pantalla? }. La app 1.0.17 también lo manda desde el ingreso con Google, Apple
   * o Facebook (`pantalla: 'login'`), que crean la cuenta si no existe.
   *
   * En la web, desde el 22/10, sale al tocar "Crear cuenta" o el botón de
   * Google, Apple o Facebook, como en la app. Antes el de email salía con sólo
   * abrir la pestaña "Crear cuenta". Lleva `navegador` ('tiktok' | 'instagram'
   * | 'facebook' | 'otro') si se toca desde el navegador de adentro de una app.
   */
  'signup_started',
  /** El registro se concretó. props: { metodo } */
  'signup_completed',
  /**
   * El registro de la web no pudo seguir. props: { metodo, motivo, navegador? }
   *
   * `motivo` es una etiqueta fija ('ya_existe', 'clave_debil',
   * 'email_invalido', 'demasiados_intentos', 'oauth', 'otro'), nunca el texto
   * del error, que puede traer el email.
   */
  'signup_fallido',
  /**
   * Se mostró un paso del onboarding. props: { paso, flujo }
   *
   * `flujo: 'corto'` es el de tres pasos (plataformas, géneros, gusto), el de
   * la app y el de la web desde 2026-10. Sin `flujo` son los viejos: el de
   * cinco de la web y el de seis de la app. El panel los separa por eso y por
   * `platform`.
   */
  'onboarding_step_viewed',
  /** Avanzó de paso. props: { paso, flujo } */
  'onboarding_step_completed',
  /** Salteó el onboarding. props: { paso, flujo, tipo: 'boton_saltar' | 'saltar_calificacion' (sólo el flujo viejo) } */
  'onboarding_skipped',
  /** Búsqueda con cero resultados. props: { query, tipo } */
  'search_no_results',
  /** Click en una plataforma de streaming. props: { provider, media_type, media_id } */
  'provider_click',
  /**
   * Click en el enlace de afiliado de Surfshark.
   * props: { media_type, media_id, pais_destino }
   *
   * Sale del bloque que aparece en la ficha cuando el título no está
   * disponible en el país de quien mira pero sí en otro. Ver
   * `components/VpnSuggestion.tsx`.
   *
   * `pais_destino` es el primer país de los que se listan, no todos: el bloque
   * tiene un solo botón, así que no hay forma de saber cuál de las banderas
   * convenció. El primero es el de mayor prioridad y el que encabeza el
   * bloque, que es la mejor aproximación disponible.
   *
   * Sin equivalente en la app de Android a propósito: el bloque es sólo de la
   * web. Promocionar una VPN para ver contenido de otra región es zona gris
   * con las políticas de Google Play, así que si este evento aparece alguna
   * vez con `platform = 'mobile'`, es un bug y no un dato.
   */
  'surfshark_click',
  /**
   * Tocó la miniatura de "Recomendado por …" en una ficha.
   * props: { creador, media_type, media_id }
   *
   * `creador` es el usuario de Instagram, sin @ (`ferlageok`), y no el nombre:
   * es lo que identifica al creador en la tabla `creators` y no cambia si
   * cambia cómo se muestra el nombre. Ver `components/CreatorRecommendations.tsx`.
   *
   * Lo mandan la web y la app. En la web cuenta la apertura del modal con el
   * reproductor; en la app, la salida a Instagram.
   */
  'recomendacion_click',
  /** Permiso de notificaciones. props: { estado: 'pedido' | 'aceptado' | 'rechazado' } */
  'notif_permission',

  // ── Captación de instalaciones de la app (iPhone y Android) ─────────
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
  /**
   * Tocó el botón de la barra y se fue a la tienda. props: { tienda }
   *
   * `tienda` es 'app_store' en iPhone y iPad, 'play_store' en el resto. Los
   * eventos de antes de la app de iPhone no la traen: eran todos de Play.
   */
  'app_banner_clicked',
  /** Cerró la barra con la X. props: {} */
  'app_banner_dismissed',
  /**
   * Click en un badge de tienda del pie de página. props: { path, tienda }
   *
   * `tienda` es 'app_store' o 'play_store'; los de antes de la app de
   * iPhone no la traen y son todos de Google Play.
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
   * `destino` es a dónde se fue ('app_store' | 'play_store' | 'glynbox_web') y `boton` es
   * cuál de los dos tocó ('principal' | 'secundario'). Van separados porque no
   * son lo mismo: en Android el principal lleva a Play Store y en escritorio el
   * secundario lleva al mismo lado. Con una sola prop no se podría distinguir
   * "eligió lo que le propusimos" de "eligió la alternativa".
   */
  'descargar_clicked',

  // ── Acciones dentro de la app de Android ────────────────────────────
  //
  // Los cuatro que manda la app nativa. No son exclusivos de ella por
  // diseño —la web podría emitirlos igual y el día que lo haga van a
  // convivir en la misma columna— pero hoy sólo llegan con
  // `platform = 'mobile'`.
  //
  // El resto de lo que manda la app reusa los nombres que ya estaban:
  // `app_open`, `page_view`, `signup_started`, `signup_completed` y los tres
  // de onboarding. Eso no es ahorro: es lo que permite poner el embudo de
  // registro de la app al lado del de la web y que las dos columnas
  // signifiquen lo mismo. Lo que las separa es `platform`, no el nombre.

  /**
   * Una búsqueda resuelta. props: { tipo, con_resultados }
   *
   * Una por búsqueda, ya pasado el debounce: cuenta búsquedas, no teclas.
   * Paginar los resultados no emite otro.
   *
   * Lleva `con_resultados` en vez de existir un evento aparte para el caso
   * vacío. Con dos eventos, el total de búsquedas es una suma que alguien se
   * va a olvidar de hacer. (`search_no_results`, que sigue más arriba, es el
   * que usa la web desde antes; la app no lo manda para no contar dos veces
   * la misma búsqueda.)
   */
  'search_performed',
  /** Abrió la ficha de una peli o serie. props: { media_type, media_id } */
  'media_opened',
  /** Calificó. props: { media_type, media_id, valor } */
  'media_rated',
  /** Guardó en watchlist. Sólo al agregar. props: { media_type, media_id } */
  'watchlist_added',
  /**
   * Sólo de la app: cómo quedaron los anuncios en ese arranque.
   * props: { estado: 'ready' | 'blocked' | 'preparando', motivo, consentimiento, plataforma }
   *
   * Existe porque `client_errors` sólo guarda fallas: sin esto no se puede
   * saber si un teléfono sin anuncios los pide y no llegan o nunca los pide.
   * Ver `lib/ads.ts` de glynbox-mobile.
   */
  'ads_estado',
  /** Sólo de la app: llegó un anuncio nativo. props: { plataforma } */
  'ad_cargado',

  // ── Permiso de notificaciones, sólo de la app ───────────────────────
  //
  // El pedido propio que va antes del diálogo del sistema. Llevan `origen`,
  // que es el camino por el que llegó el pedido:
  //   'onboarding'     la tarjeta de "Tus primeras recomendaciones".
  //   'watchlist'      al guardar en "Ver después" (hasta la 1.0.15, una
  //                    segunda vuelta de una sola vez).
  //   'famoso'         al seguir a un famoso (1.0.16).
  //   'calificaciones' en la 3.ª calificación (1.0.16).
  //   'regreso'        al volver a la app después de 3 días o más (1.0.16).
  //   'follow'         al seguir a un usuario por primera vez (1.0.16).
  //   'recordatorio'   sólo en builds de prueba de la 1.0.16 anteriores a los
  //                    caminos: el camino va en `momento` ('watchlist' |
  //                    'regreso').
  // Desde la 1.0.16 los de contexto llevan además { vez, estado:
  // 'sin_preguntar' | 'bloqueado' | 'provisional' }. `sin_preguntar` = el
  // sistema todavía puede mostrar su aviso; `provisional` = iPhone con el
  // permiso provisional, que puede pasar a normal.
  // Aceptados sobre ofrecidos es la tasa; `resultado` dice qué contestó
  // después el sistema, porque tocar "Sí" y negar en el diálogo no es aceptar.

  /** Se mostró el pedido. props: { origen, flujo } */
  'push_ofrecido',
  /** Tocó "Sí, avisame" / "Activar". props: { origen, flujo, resultado: 'granted' | 'denied' | 'error' | ... } */
  'push_aceptado',
  /** Tocó "Ahora no". props: { origen, flujo } */
  'push_ahora_no',
  /**
   * Tocó "Abrir ajustes" en el recordatorio: el permiso estaba bloqueado en
   * el sistema y no se puede volver a preguntar. props: las del recordatorio.
   */
  'push_ajustes_abiertos',
  /**
   * Terminó con el permiso dado y el token guardado después de un
   * recordatorio, por el diálogo o volviendo de los ajustes. props: las del
   * recordatorio + { via: 'dialogo' | 'ajustes' }.
   */
  'push_activado',
  /**
   * iPhone: iOS dio el permiso provisional (las notificaciones llegan calladas
   * al Centro de Notificaciones, sin preguntar). Una vez por instalación.
   * Sólo de la app, desde la 1.0.16.
   */
  'push_provisional',
  /**
   * iPhone: quien tenía el provisional decidió. Se detecta al abrir la app.
   * props: { resultado: 'normales' | 'desactivadas' }.
   */
  'push_provisional_resultado',
  /**
   * Abrió la app tocando una notificación push. Sólo de la app.
   * props: { tipo, envio, arranque: 'frio' | 'abierta' }. `tipo` es el `data.type`
   * de la push ('recomendacion' para "Ferlage te recomienda ver", 'semanal'
   * para "Tu resumen semanal", 'dia1' para "Para esta noche") y `envio` el
   * id de `push_envios`, que el historial de `/admin/recomendaciones` cuenta.
   */
  'push_abierta',

  // ── Modo deslizar (sólo la app) ─────────────────────────────────────────
  // Cuánto se usa: entradas y tarjetas por persona. Ver `lib/useSwipeDeck.ts`
  // de glynbox-mobile.

  /** Entró al modo deslizar. props: { origen } */
  'deslizar_abierto',
  /**
   * Una tarjeta. props: { accion: 'me_gusto' | 'no_me_gusto' | 'quiero_verla' |
   * 'pasar', gesto: 'deslizar' | 'boton', media_type, media_id, tarjeta,
   * parecida, fuente? }. `tarjeta` cuenta las de esa entrada (el máximo por
   * sesión es cuántas pasó); `parecida` = llegó por un "Me gustó" anterior.
   * `fuente` (desde el 22/10): 'plataformas' | 'generos' | 'calificadas' |
   * 'parecida', de dónde salió la tarjeta (ver `lib/swipe.ts` de
   * glynbox-mobile); 'calificadas' son recomendaciones de lo que calificó con
   * 4 o más en cualquier parte de la app.
   * `con_estrellas` y `estrellas` (desde el 27/10): si calificó con las
   * estrellas de la tarjeta antes de la acción, y con cuánto (0.5 a 5; `null`
   * sin estrellas). Con estrellas, esa nota reemplaza al 4 o el 2.
   */
  'deslizar_accion',
  /** Deshizo la última. props: { accion, media_type, media_id } */
  'deslizar_deshacer',

  // ── Recomendaciones (sólo la app, 1.0.16) ───────────────────────────────

  /**
   * Tocó "Otras opciones" (Qué ver) o ↻ ("Recomendado para vos"): pidió una
   * tanda nueva. props: { lugar: 'que_ver' | 'inicio' }
   */
  'recomendaciones_regeneradas',

  // ── Calificación en la tienda (sólo la app) ─────────────────────────────

  /**
   * Se pidió calificación con la API de Play / App Store. props: { momento:
   * 'resena' | 'logro' | 'deslizar' | 'tercera_visita', plataforma }. Cuenta
   * pedidos, no diálogos vistos: ninguna de las dos tiendas avisa si salió.
   * Ver `lib/storeReview.ts` de glynbox-mobile.
   */
  'review_pedido',

  // ── Reseña en una frase (web y app, 2026-10) ────────────────────────────

  /**
   * Después de calificar con 4 o 5, "¿La resumís en una frase?". props:
   * { media_type, media_id, nota }. Una vez por día por persona.
   */
  'resena_frase_ofrecida',
  /** La escribió: quedó como reseña normal. props: { media_type, media_id, nota, largo } */
  'resena_frase_guardada',
  /** La cerró sin escribir. props: { media_type, media_id } */
  'resena_frase_descartada',

  // ── Letterboxd (2026-10) ────────────────────────────────────────────────

  /**
   * La app abrió la importación de la web. props: { origen: 'ajustes' |
   * 'onboarding', con_sesion }. `con_sesion` = se abrió ya con la cuenta
   * iniciada (ver `app/api/sesion-web`).
   */
  'letterboxd_abierto',

  // ── Historias de compartir (web y app, 2026-10) ─────────────────────────

  /**
   * Tocó compartir una historia. props: { que: 'calificacion' | 'lista' |
   * 'top5', desde: 'ficha' | 'lista' | 'perfil' }
   */
  'compartir_abierto',
  /**
   * Eligió dónde mandarla. props: { que, desde, metodo? }. En la web,
   * `metodo` es 'menu' (el menú del navegador) o 'descarga' (la bajó).
   */
  'compartir_hecho',

  // ── Gente con tu gusto (web y app, 2026-10) ─────────────────────────────

  /** Se vio el carrusel de Comunidad con gente. props: { personas } */
  'gusto_carrusel_visto',
  /** Abrió un perfil desde el carrusel. props: { porcentaje } */
  'gusto_perfil_abierto',
  /** Tocó "Seguir" en el carrusel. props: { porcentaje } */
  'gusto_seguir',

  // ── ¿Qué veo hoy? (web y app, 2026-10) ──────────────────────────────────

  /** Empezó. props: { desde: 'inicio' | 'que_ver', repetida? } (repetida = "¿Lo mismo que la última vez?") */
  'que_veo_hoy_abierto',
  /**
   * Respondió las dos preguntas. props: { compania: 'solo' | 'pareja' |
   * 'amigos' | 'familia', ganas: 'reirme' | 'tension' | 'emocionarme' |
   * 'liviano' | 'sorprendeme', repetida }
   */
  'que_veo_hoy_respuestas',
  /**
   * Se mostró una recomendación. props: { intento (1 = la primera, 2 a 4 =
   * "Otra"), fuente: 'calificadas' | 'plataformas', media_type, media_id }
   */
  'que_veo_hoy_resultado',
  /** Tocó un botón. props: { accion: 'la_veo' | 'otra' | 'guardar' | 'cerrar', intento, media_type, media_id } */
  'que_veo_hoy_accion',

  // ── Idioma (sólo la app, 2026-10) ───────────────────────────────────────

  /**
   * Eligió un idioma en Ajustes. props: { idioma: 'es' | 'en', anterior,
   * preferencia: 'auto' | 'es' | 'en' }. `idioma` es en el que queda la app
   * (con 'auto', el del teléfono) y `anterior` en el que estaba. Sale aunque
   * elija el que ya tenía.
   */
  'idioma_cambiado',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

const EVENT_NAME_SET: ReadonlySet<string> = new Set(EVENT_NAMES)

export function isKnownEvent(name: unknown): name is EventName {
  return typeof name === 'string' && EVENT_NAME_SET.has(name)
}

/** Valores que pueden ir dentro de `props`. Nada anidado: se aplana o se descarta. */
export type EventProps = Record<string, string | number | boolean | null>
