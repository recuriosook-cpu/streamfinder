/**
 * Clasificación de user-agents. Funciones puras, sin nada de Next.
 *
 * Está aparte de `app/api/track/route.ts` por el mismo motivo que
 * `analytics-sanitize.ts`: es la pieza de la que depende que las métricas no
 * mientan, y tiene que poder ejercitarse contra una lista de user-agents reales
 * sin levantar un servidor.
 *
 * ── Por qué marcar y no descartar ────────────────────────────────────────
 *
 * El evento del bot se guarda igual, con `is_bot = true`. No se tira.
 *
 * Un filtro de user-agents es una lista de patrones escrita a mano contra un
 * universo que cambia solo: mañana sale un crawler nuevo, o peor, un navegador
 * raro que matchea un patrón que no debía. Las dos cosas van a pasar.
 *
 * Si el evento se descarta, el error es **irreversible**: cuando descubramos
 * que estuvimos tirando a los usuarios de algún navegador, esos datos no
 * existen más y no hay forma de recuperarlos. Si el evento se guarda marcado,
 * el error es **un UPDATE**: se corrige el patrón y se recalcula la columna.
 *
 * El costo de guardar es una fila de más en una tabla que ya tiene un índice
 * parcial para ignorarla. El costo de tirar es no enterarse nunca.
 *
 * Y de yapa, se puede medir cuánto del tráfico son crawlers — que era
 * exactamente la pregunta que no pudimos contestar sobre los primeros 3086
 * eventos, porque no habíamos guardado nada del user-agent.
 *
 * El panel nunca cuenta bots: filtra por `is_bot = false`. La marca existe para
 * poder auditar, no para mostrar.
 */

/** Qué se decidió y por qué. `reason` va a la base para poder auditar después. */
export interface BotVerdict {
  isBot: boolean
  /** El patrón que matcheó, o `null` si no matcheó ninguno. */
  reason: string | null
}

const HUMAN: BotVerdict = { isBot: false, reason: null }

/**
 * Buscadores y crawlers que ejecutan JavaScript.
 *
 * Son los únicos que pueden llegar a `/api/track`, porque el evento se manda
 * con un `fetch` desde el navegador: un crawler que sólo baja el HTML nunca
 * corre el `track()`. Googlebot renderiza, y por eso está primero.
 *
 * Cada patrón es lo más largo posible a propósito. Ver `NAVEGADORES_REALES`.
 */
const CRAWLERS = [
  // Google — nunca `google` a secas: `GSA/` es la app de Google, con una
  // persona real adentro navegando.
  'googlebot', 'adsbot-google', 'mediapartners-google', 'apis-google',
  'feedfetcher-google', 'google-inspectiontool', 'googleother',
  'storebot-google', 'google-extended', 'google-cloudvertexbot',
  'google favicon', 'google-read-aloud', 'google-safety',

  // Microsoft / Yahoo
  'bingbot', 'adidxbot', 'bingpreview', 'msnbot', 'slurp',

  // Resto de buscadores
  'duckduckbot', 'duckassistbot', 'baiduspider', 'sogou', 'seznambot',
  'exabot', 'petalbot', 'applebot', 'amazonbot', 'bytespider', 'yeti/',
  'naver.me/bot', 'coccocbot', 'qwantify', 'mojeekbot', 'gigabot',

  // Yandex: el crawler es `YandexBot`. `YaBrowser` es el navegador de Yandex,
  // con gente real. Por eso el patrón lleva el `bot` pegado.
  'yandexbot', 'yandeximages', 'yandex.com/bots',

  // Archivo
  'ia_archiver', 'archive.org_bot', 'wayback',

  // Crawlers de IA
  'gptbot', 'oai-searchbot', 'chatgpt-user', 'perplexitybot', 'perplexity-user',
  'claudebot', 'claude-web', 'claude-searchbot', 'anthropic-ai',
  'meta-externalagent', 'meta-externalfetcher', 'ccbot', 'diffbot',
  'cohere-ai', 'timpibot', 'youbot', 'imagesiftbot',
] as const

/**
 * Previews de links.
 *
 * El bicho que desenrolla el link cuando alguien lo pega en un chat. Casi
 * ninguno ejecuta JS, así que casi ninguno llega hasta acá — pero el endpoint
 * es público y no cuesta nada cubrirlos.
 *
 * Ojo con la diferencia que importa: `facebookexternalhit` es el crawler,
 * `FBAN`/`FBAV` es el navegador embebido de la app de Facebook, con una persona
 * adentro. Lo mismo `Twitterbot` contra `Twitter for iPhone`, y `WhatsApp/2.x`
 * contra alguien que clickeó un link de WhatsApp y lo abrió en Chrome.
 */
const PREVIEWS = [
  'facebookexternalhit', 'facebookcatalog', 'facebookbot', 'facebot',
  'twitterbot', 'whatsapp/', 'telegrambot', 'slackbot', 'slack-imgproxy',
  'discordbot', 'linkedinbot', 'pinterestbot', 'redditbot',
  'skypeuripreview', 'viberbot', 'embedly', 'quora link preview',
  'vkshare', 'tumblr', 'flipboard', 'nuzzel', 'outbrain', 'w3c_validator',
  'developers.google.com/+/web/snippet', 'iframely', 'bufferbot',
  'snapchat', 'apple-pubsub',
] as const

/**
 * Herramientas: SEO, monitoreo, automatización, clientes HTTP.
 *
 * `okhttp` NO está en la lista, y es a propósito: es el cliente HTTP que usa
 * Android por debajo, o sea el que va a mandar nuestra propia app nativa cuando
 * se instrumente. Marcarla como bot sería marcar a nuestros propios usuarios.
 */
const TOOLS = [
  // Headless y automatización — lo que más probablemente llegue acá con JS
  // corriendo de verdad.
  'headlesschrome', 'headless', 'phantomjs', 'puppeteer', 'playwright',
  'selenium', 'webdriver', 'cypress', 'chrome-lighthouse', 'lighthouse',

  // Monitoreo / performance
  'uptimerobot', 'pingdom', 'statuscake', 'site24x7', 'newrelicpinger',
  'datadog', 'gtmetrix', 'pagespeed', 'speedcurve', 'catchpoint',
  'betteruptime', 'checkly',

  // SEO
  'semrushbot', 'ahrefsbot', 'ahrefssiteaudit', 'mj12bot', 'dotbot',
  'blexbot', 'dataforseobot', 'serpstatbot', 'screaming frog', 'seokicks',
  'zoominfobot', 'megaindex', 'sitebulb', 'barkrowler', 'linkdexbot',

  // Clientes HTTP y scrapers
  'python-requests', 'python-urllib', 'aiohttp', 'httpx', 'scrapy',
  'curl/', 'wget/', 'libwww-perl', 'go-http-client', 'java/', 'jakarta',
  'apache-httpclient', 'axios/', 'node-fetch', 'postmanruntime',
  'insomnia', 'restsharp', 'guzzlehttp', 'httpie',
] as const

/**
 * Red de seguridad para lo que no está en ninguna lista.
 *
 * Un crawler nuevo casi siempre se anuncia con una de estas palabras. Son dos
 * patrones y no uno, porque las dos mitades tienen riesgos opuestos:
 *
 * `bot` se ancla por DERECHA, no por izquierda. Un borde a la izquierda dejaría
 * pasar `NuevoBot/1.0` —los crawlers se nombran en CamelCase, todo pegado— y
 * uno a la derecha con `[^a-z]` dejaría entrar `CUBOT_NOTE_20`, que es un
 * teléfono Android real. Lo que separa a los dos es el carácter que sigue:
 *
 *   crawler:  `NuevoBot/1.0`  `PetalBot;+https`  `(compatible; Bot)`
 *   teléfono: `CUBOT_NOTE_20`  `CUBOT Build/RP1A`
 *
 * O sea: `/`, `;` o `)` es un token de producto con versión — un bicho. Un `_`
 * o un espacio es parte del nombre de un modelo. Por las dudas, `cubot` está
 * además en la lista de abajo, que corre antes y gana.
 *
 * El resto de las palabras van como substring pelado, sin ancla de ningún lado:
 * ningún navegador real trae `crawler` ni `spider` en el user-agent, así que no
 * hay nada de qué protegerse y sí hay CamelCase que atrapar.
 */
const GENERIC_BOT = /bot(?:[/;)]|$)/
const GENERIC_OTROS = /crawler|spider|scraper|fetcher|indexer|archiver|validator/

/**
 * User-agents que se parecen a un bot y NO lo son.
 *
 * Esta lista corre ANTES que todo lo demás y gana siempre. Es la defensa contra
 * el error caro: marcar como bot a una persona.
 *
 * Casi todas las entradas son navegadores embebidos de apps —Facebook,
 * Instagram, TikTok, la app de Google— donde hay alguien de carne y hueso
 * navegando. Varios traen la palabra de la marca en el user-agent y matchearían
 * un patrón escrito con menos cuidado.
 */
const NAVEGADORES_REALES = [
  'fban', 'fbav', 'fb_iab',         // navegador embebido de Facebook / Messenger
  'instagram',                       // navegador embebido de Instagram
  'gsa/',                            // app de Google (iOS y Android)
  'yabrowser',                       // navegador Yandex — NO es YandexBot
  'ucbrowser', 'ucweb',              // UC Browser
  'opera mini', 'opr/',              // Opera y Opera Mini
  'samsungbrowser',                  // Samsung Internet
  'silk/',                           // Amazon Silk (tablets Fire)
  'puffin',                          // Puffin
  'duckduckgo/',                     // navegador DuckDuckGo — NO es DuckDuckBot
  'miuibrowser', 'heytapbrowser', 'vivobrowser', 'oppobrowser',
  'musical_ly', 'bytedancewebview',  // webview de TikTok — NO es Bytespider
  'line/',                           // navegador embebido de LINE
  'kakaotalk',
  'electron/',                       // apps de escritorio, incluida la de Slack
  'cubot',                           // marca de teléfonos: `CUBOT_NOTE_20`
] as const

/**
 * ¿Este user-agent es un bot?
 *
 * Nunca tira. Un user-agent es texto que manda el cliente: puede venir vacío,
 * gigante o con basura.
 */
export function classifyUserAgent(raw: string | null | undefined): BotVerdict {
  if (typeof raw !== 'string') {
    // Sin header. Un navegador siempre manda user-agent, así que esto es un
    // script — pero se marca, no se descarta, por si algún día aparece un
    // cliente legítimo que no lo mande.
    return { isBot: true, reason: 'sin-user-agent' }
  }

  const ua = raw.trim().toLowerCase()
  if (!ua) return { isBot: true, reason: 'user-agent-vacio' }

  // Primero los falsos positivos conocidos. Ganan sobre todo lo demás.
  for (const seguro of NAVEGADORES_REALES) {
    if (ua.includes(seguro)) return HUMAN
  }

  for (const p of CRAWLERS) if (ua.includes(p)) return { isBot: true, reason: p }
  for (const p of PREVIEWS) if (ua.includes(p)) return { isBot: true, reason: p }
  for (const p of TOOLS) if (ua.includes(p)) return { isBot: true, reason: p }

  if (GENERIC_BOT.test(ua) || GENERIC_OTROS.test(ua)) {
    return { isBot: true, reason: 'generico' }
  }

  return HUMAN
}

/** Azúcar para quien sólo quiere el booleano. */
export function isBotUserAgent(raw: string | null | undefined): boolean {
  return classifyUserAgent(raw).isBot
}
