/**
 * Verifica el filtro de bots contra user-agents reales.
 *
 *   node scripts/check-bot-filter.mjs
 *
 * Existe porque el riesgo de este filtro no está repartido parejo: marcar un
 * crawler de menos cuesta un poco de ruido en las métricas, marcar a una
 * persona de más la borra del panel. Por eso la lista de "tienen que ser
 * humanos" está llena de navegadores raros a propósito — webviews de apps,
 * teléfonos baratos con la palabra `bot` en el modelo, navegadores que llevan
 * el nombre de un buscador que además tiene crawler.
 *
 * Corre con el strip-types de Node, sin build. Si agregás un patrón a
 * `lib/analytics-bots.ts`, corré esto antes de commitear.
 */

import { classifyUserAgent } from '../lib/analytics-bots.ts'

// ── Tienen que dar HUMANO ──────────────────────────────────────────────────
// Los primeros son los obvios. Los interesantes empiezan en Samsung Internet.
const HUMANOS = [
  ['Chrome desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'],
  ['Safari iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'],
  ['Firefox Android', 'Mozilla/5.0 (Android 14; Mobile; rv:129.0) Gecko/129.0 Firefox/129.0'],
  ['Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'],
  ['Safari Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15'],
  ['Brave (se hace pasar por Chrome)', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'],
  ['Vivaldi', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Vivaldi/6.9'],
  ['IE 11 (viejisimo)', 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko'],

  // A partir de acá, los que un filtro descuidado rompe.
  ['Samsung Internet', 'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36'],
  ['Opera', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/114.0.0.0'],
  ['Opera Mini', 'Opera/9.80 (Android; Opera Mini/62.3.2254/191.303; U; es) Presto/2.12.423 Version/12.16'],
  ['UC Browser', 'Mozilla/5.0 (Linux; U; Android 11; es-AR; Redmi Note 10) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.4.0.1306 Mobile Safari/537.36'],
  // YaBrowser es el navegador de Yandex. YandexBot es el crawler. Distintos.
  ['Yandex Browser', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 YaBrowser/24.6.0.0 Safari/537.36'],
  // Igual acá: DuckDuckGo/7 es el navegador, DuckDuckBot es el crawler.
  ['DuckDuckGo browser', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 DuckDuckGo/7 Safari/604.1'],
  // FBAN/FBAV es una persona dentro de la app de Facebook.
  // facebookexternalhit es el crawler. No confundir.
  ['Facebook in-app', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.35.109;FBBV/6...]'],
  ['Instagram in-app', 'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 340.0.0.30.106 Android'],
  // BytedanceWebview es el webview de TikTok. Bytespider es el crawler.
  ['TikTok webview', 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/115.0.0.0 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6'],
  // GSA = Google Search App. Alguien navegando dentro de la app de Google.
  ['App de Google (GSA)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/318.0.632659177 Mobile/15E148 Safari/604.1'],
  // El caso que justifica el borde de palabra en el patrón generico de `bot`.
  ['CUBOT (telefono barato)', 'Mozilla/5.0 (Linux; Android 11; CUBOT_NOTE_20 Build/RP1A.200720.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36'],
  ['Amazon Silk', 'Mozilla/5.0 (Linux; Android 9; KFMAWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/119.3.3 like Chrome/119.0.6045.163 Safari/537.36'],
  ['Puffin', 'Mozilla/5.0 (Linux; Android 10; Puffin) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95 Mobile Safari/537.36 Puffin/9.10.1.51563AP'],
  ['MIUI Browser', 'Mozilla/5.0 (Linux; U; Android 12; es-ar; M2101K6G) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/71.0.3578.141 Mobile Safari/537.36 XiaoMi/MiuiBrowser/13.12.0'],
  ['LINE in-app', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 Line/13.12.0'],
  ['Chrome Android WebView', 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/117.0.0.0 Mobile Safari/537.36'],
  ['KaiOS', 'Mozilla/5.0 (Mobile; LYF/F90M/LYF-F90M; Android; rv:48.0) Gecko/48.0 Firefox/48.0 KAIOS/2.5'],
  // okhttp queda afuera de la lista de bots a propósito: es lo que va a mandar
  // nuestra propia app nativa cuando se instrumente.
  ['app nativa Android (okhttp)', 'okhttp/4.12.0'],
]

// ── Tienen que dar BOT ────────────────────────────────────────────────────
const BOTS = [
  ['Googlebot mobile', 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.264 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
  ['Googlebot desktop', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/131.0.0.0 Safari/537.36'],
  ['Google InspectionTool', 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)'],
  ['Bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
  ['Applebot', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)'],
  ['YandexBot', 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)'],
  ['Baiduspider', 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'],
  ['PetalBot', 'Mozilla/5.0 (Linux; Android 7.0;) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)'],
  ['Bytespider', 'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)'],
  ['GPTBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot'],
  ['ClaudeBot', 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'],
  ['PerplexityBot', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)'],
  ['facebookexternalhit', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
  ['Twitterbot', 'Twitterbot/1.0'],
  ['WhatsApp preview', 'WhatsApp/2.2413.1 N'],
  ['Slackbot', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
  ['Discordbot', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'],
  ['TelegramBot', 'TelegramBot (like TwitterBot)'],
  ['LinkedInBot', 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)'],
  ['HeadlessChrome', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36'],
  ['Lighthouse', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36 Chrome-Lighthouse'],
  ['AhrefsBot', 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)'],
  ['SemrushBot', 'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)'],
  ['curl', 'curl/8.4.0'],
  ['python-requests', 'python-requests/2.31.0'],
  ['Go http', 'Go-http-client/2.0'],
  ['UptimeRobot', 'Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)'],
  // Red de seguridad: crawlers que todavía no existen.
  ['crawler nuevo (CamelCase)', 'Mozilla/5.0 (compatible; SuperNuevoCrawler/1.0; +http://ejemplo.com)'],
  ['spider nuevo', 'AlgunSpider/2.0 (+http://ejemplo.com)'],
  ['bot nuevo', 'Mozilla/5.0 (compatible; NuevoBot/1.0)'],
  ['sin user-agent', null],
  ['user-agent vacio', '   '],
]

let fallos = 0

console.log('=== TIENEN QUE SER HUMANOS ===')
for (const [nombre, ua] of HUMANOS) {
  const v = classifyUserAgent(ua)
  if (v.isBot) fallos++
  console.log(`${v.isBot ? 'FALLA ' : '  ok  '} ${nombre.padEnd(34)} ${v.isBot ? 'BOT (' + v.reason + ')' : 'humano'}`)
}

console.log('\n=== TIENEN QUE SER BOTS ===')
for (const [nombre, ua] of BOTS) {
  const v = classifyUserAgent(ua)
  if (!v.isBot) fallos++
  console.log(`${v.isBot ? '  ok  ' : 'FALLA '} ${nombre.padEnd(34)} ${v.isBot ? 'bot (' + v.reason + ')' : 'HUMANO'}`)
}

console.log(`\n${fallos === 0 ? 'TODO OK' : fallos + ' FALLAS'} — ${HUMANOS.length} humanos, ${BOTS.length} bots`)
process.exitCode = fallos === 0 ? 0 : 1
