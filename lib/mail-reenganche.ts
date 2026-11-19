// SERVER-ONLY. Lo usa scripts/mail-prueba.ts, que corre fuera de Next con tsx:
// sólo imports relativos, nada de `@/` ni de `next/*`.

import { elegidasEnElPais, plataformasDelPais, type PlataformaPais } from './plataformas-pais'
import { normalizarIdioma, idiomaTmdb, type Idioma } from './idioma'

/**
 * El mail de "reenganche": 3 títulos nuevos o populares de esta semana en las
 * plataformas de la persona y en su país, más una recomendación de Fer.
 *
 * ── Qué títulos ────────────────────────────────────────────────────────────
 *
 * La misma búsqueda que los estrenos de "Tu resumen semanal"
 * (`lib/resumen-semanal.ts`): `discover` de TMDB en su país, sólo suscripción,
 * gratis o con publicidad, en sus plataformas (contra la lista del país, como
 * en todo el sitio: `elegidasEnElPais`), ordenado por popularidad. Primero lo
 * estrenado hace poco (películas 120 días, series 60); si no alcanza, lo más
 * popular de sus plataformas sin mirar la fecha. Se alternan película y serie.
 *
 * Nunca va algo que vio, calificó o reseñó, ni la recomendación de Fer. La
 * plataforma de cada uno se confirma con su ficha: discover puede estar
 * atrasado.
 *
 * ── La plataforma principal ────────────────────────────────────────────────
 *
 * La del asunto: la primera de sus plataformas (en el orden en que las eligió)
 * que tenga alguno de los 3 títulos; si no, la primera que exista en su país.
 */

const TMDB = 'https://api.themoviedb.org/3'
const SITIO = 'https://www.glynbox.com'
const DIA_MS = 24 * 60 * 60 * 1000

export type MediaType = 'movie' | 'tv'

export interface Destinatario {
  userId: string
  email: string
  nombre: string | null
  idioma: string | null
  country: string | null
  favoritePlatforms: string[] | null
  /** Para utm_content: quién llegó, aunque no esté logueado. */
  codigo: string
  /** Para el link de baja. */
  bajaToken: string
}

export interface TituloMail {
  mediaType: MediaType
  id: number
  titulo: string
  anio: string | null
  poster: string | null
  /** Dónde verlo en su país; `null` si no está en ninguna plataforma de suscripción. */
  plataforma: string | null
}

export interface Recomendacion {
  mediaType: MediaType
  id: number
  frase: string
}

export interface Campana {
  /** utm_campaign, y el nombre de la prueba en `mail_prueba`. */
  nombre: string
  /** 1, 2 o 3: cuál de los asuntos. */
  asunto: 1 | 2 | 3
}

const clave = (t: { mediaType: string; id: number }) => `${t.mediaType}:${t.id}`

// ── TMDB, con memoria por corrida ──────────────────────────────────────────

const memoria = new Map<string, Promise<unknown>>()

function tmdb<T>(ruta: string, params: Record<string, string>): Promise<T | null> {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!key) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY.')
  const url = `${TMDB}${ruta}?${new URLSearchParams({ api_key: key, ...params })}`
  let p = memoria.get(url) as Promise<T | null> | undefined
  if (!p) {
    p = (async () => {
      for (let intento = 0; intento < 3; intento++) {
        const r = await fetch(url).catch(() => null)
        if (r?.ok) return (await r.json()) as T
        if (r && r.status !== 429 && r.status < 500) return null
        await new Promise(res => setTimeout(res, 800 * (intento + 1)))
      }
      return null
    })()
    memoria.set(url, p)
  }
  return p
}

const listas = new Map<string, Promise<PlataformaPais[] | null>>()

function plataformasDe(pais: string): Promise<PlataformaPais[] | null> {
  let l = listas.get(pais)
  if (!l) {
    l = plataformasDelPais(pais).catch(() => null)
    listas.set(pais, l)
  }
  return l
}

function hace(dias: number): string {
  return new Date(Date.now() - dias * DIA_MS).toISOString().slice(0, 10)
}

/** País de la persona; el que no se sabe, Argentina (como la semanal). */
export function paisDe(country: string | null): string {
  return country && /^[A-Z]{2}$/.test(country) ? country : 'AR'
}

interface FichaTmdb {
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  'watch/providers'?: {
    results?: Record<string, { flatrate?: { provider_id: number; provider_name: string }[]; free?: { provider_id: number; provider_name: string }[]; ads?: { provider_id: number; provider_name: string }[] }>
  }
}

/**
 * La ficha en su idioma y dónde verla en su país. Prefiere sus plataformas;
 * si no está en ninguna, la primera de suscripción que dé TMDB (o null).
 */
async function ficha(
  mediaType: MediaType,
  id: number,
  pais: string,
  idioma: Idioma,
  suyas: Map<number, PlataformaPais>,
): Promise<(TituloMail & { enSuyas: boolean; plataformaId: number | null }) | null> {
  const json = await tmdb<FichaTmdb>(`/${mediaType}/${id}`, {
    language: idiomaTmdb(idioma),
    append_to_response: 'watch/providers',
  })
  if (!json) return null
  const titulo = (mediaType === 'movie' ? json.title : json.name)?.trim()
  if (!titulo) return null
  const region = json['watch/providers']?.results?.[pais]
  const proveedores = [...(region?.flatrate ?? []), ...(region?.free ?? []), ...(region?.ads ?? [])]
  const suya = proveedores.find(p => suyas.has(p.provider_id))
  const fecha = mediaType === 'movie' ? json.release_date : json.first_air_date
  return {
    mediaType,
    id,
    titulo,
    anio: fecha ? fecha.slice(0, 4) : null,
    poster: json.poster_path ? `https://image.tmdb.org/t/p/w342${json.poster_path}` : null,
    plataforma: suya ? suyas.get(suya.provider_id)!.name : proveedores[0]?.provider_name ?? null,
    enSuyas: !!suya,
    plataformaId: suya ? suyas.get(suya.provider_id)!.id : null,
  }
}

async function descubrir(mediaType: MediaType, proveedores: number[], pais: string, recientes: boolean, pagina: string) {
  const campo = mediaType === 'movie' ? 'primary_release_date' : 'first_air_date'
  const params: Record<string, string> = {
    watch_region: pais,
    with_watch_providers: [...proveedores].sort((a, b) => a - b).join('|'),
    with_watch_monetization_types: 'flatrate|free|ads',
    sort_by: 'popularity.desc',
    include_adult: 'false',
    'vote_count.gte': recientes ? '10' : '100',
    page: pagina,
  }
  if (recientes) {
    params[`${campo}.gte`] = hace(mediaType === 'movie' ? 120 : 60)
    params[`${campo}.lte`] = hace(0)
  }
  const json = await tmdb<{ results?: { id: number }[] }>(`/discover/${mediaType}`, params)
  return (json?.results ?? []).map(r => ({ mediaType, id: r.id }))
}

function alternar<T>(a: T[], b: T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i])
    if (i < b.length) out.push(b[i])
  }
  return out
}

export interface Contenido {
  idioma: Idioma
  pais: string
  /** La del asunto. `null` si ninguna de sus plataformas existe en su país. */
  principal: string | null
  titulos: TituloMail[]
  reco: (TituloMail & { frase: string }) | null
}

/**
 * Lo que va en el mail de una persona. `excluir` son claves `movie:123` de lo
 * que vio, calificó o reseñó.
 */
export async function armarContenido(
  d: Pick<Destinatario, 'idioma' | 'country' | 'favoritePlatforms'>,
  excluir: Set<string>,
  reco: Recomendacion & { fraseEn?: string },
): Promise<Contenido> {
  const idioma = normalizarIdioma(d.idioma)
  const pais = paisDe(d.country)
  const lista = await plataformasDe(pais)
  const suyas = lista ? elegidasEnElPais(d.favoritePlatforms, lista) : new Map<number, PlataformaPais>()
  // En el orden en que las eligió, sin repetir (cada plataforma tiene varios ids).
  const ordenadas: PlataformaPais[] = []
  for (const fav of d.favoritePlatforms ?? []) {
    const p = [...suyas.values()].find(x => x.id === Number(fav) || x.ids.includes(Number(fav)))
    if (p && !ordenadas.includes(p)) ordenadas.push(p)
  }

  const fuera = new Set(excluir)
  fuera.add(clave(reco))

  const titulos: TituloMail[] = []
  const porPlataforma = new Map<number, number>()
  if (suyas.size > 0) {
    const proveedores = [...suyas.keys()]
    const tandas = [
      () => Promise.all([descubrir('movie', proveedores, pais, true, '1'), descubrir('tv', proveedores, pais, true, '1')]),
      () => Promise.all([descubrir('movie', proveedores, pais, false, '1'), descubrir('tv', proveedores, pais, false, '1')]),
    ]
    for (const tanda of tandas) {
      if (titulos.length >= 3) break
      const [pelis, series] = await tanda()
      const candidatos = alternar(pelis, series).filter(c => !fuera.has(clave(c)))
      for (let i = 0; i < candidatos.length && titulos.length < 3; i += 4) {
        const fichas = await Promise.all(candidatos.slice(i, i + 4).map(c => ficha(c.mediaType, c.id, pais, idioma, suyas)))
        for (const f of fichas) {
          if (!f || !f.enSuyas || titulos.length >= 3 || fuera.has(clave(f))) continue
          fuera.add(clave(f))
          titulos.push({ mediaType: f.mediaType, id: f.id, titulo: f.titulo, anio: f.anio, poster: f.poster, plataforma: f.plataforma })
          porPlataforma.set(f.plataformaId!, (porPlataforma.get(f.plataformaId!) ?? 0) + 1)
        }
      }
    }
  }

  const principal =
    ordenadas.find(p => porPlataforma.has(p.id))?.name ?? ordenadas[0]?.name ?? null

  const recoFicha = await ficha(reco.mediaType, reco.id, pais, idioma, suyas)
  const frase = idioma === 'en' && reco.fraseEn ? reco.fraseEn : reco.frase

  return {
    idioma,
    pais,
    principal,
    titulos,
    reco: recoFicha
      ? { mediaType: recoFicha.mediaType, id: recoFicha.id, titulo: recoFicha.titulo, anio: recoFicha.anio, poster: recoFicha.poster, plataforma: recoFicha.plataforma, frase }
      : null,
  }
}

/** Para comprobar el id de la recomendación antes de mandar nada. */
export async function existeEnTmdb(mediaType: MediaType, id: number): Promise<string | null> {
  const json = await tmdb<FichaTmdb>(`/${mediaType}/${id}`, { language: 'es-AR' })
  return (mediaType === 'movie' ? json?.title : json?.name) ?? null
}

// ── El mail ────────────────────────────────────────────────────────────────

const TEXTOS = {
  es: {
    asunto: [
      (p: string) => `3 para ver este finde en ${p}`,
      (p: string) => `Lo nuevo en ${p} que te estás perdiendo`,
      (p: string, t: string) => `${t} y 2 más para ver en ${p}`,
    ],
    asuntoSinPlataforma: '3 para ver este finde',
    preencabezado: 'Lo más visto de esta semana en tus plataformas, y una recomendación mía.',
    hola: (n: string | null) => (n ? `Hola, ${n}` : 'Hola'),
    intro: 'Te junté 3 cosas nuevas o populares de esta semana que podés ver en tus plataformas.',
    en: 'En',
    verFicha: 'Ver ficha',
    miReco: 'Mi recomendación',
    firma: 'Fer, de Glynbox',
    pie: 'Recibís este mail porque tenés cuenta en Glynbox.',
    baja: 'Darme de baja',
    pelicula: 'Película',
    serie: 'Serie',
  },
  en: {
    asunto: [
      (p: string) => `3 to watch this weekend on ${p}`,
      (p: string) => `What's new on ${p} that you're missing`,
      (p: string, t: string) => `${t} and 2 more to watch on ${p}`,
    ],
    asuntoSinPlataforma: '3 to watch this weekend',
    preencabezado: "This week's most-watched on your services, plus a pick of mine.",
    hola: (n: string | null) => (n ? `Hi ${n}` : 'Hi'),
    intro: 'Here are 3 new or popular picks this week that you can watch on your streaming services.',
    en: 'On',
    verFicha: 'See details',
    miReco: 'My pick',
    firma: 'Fer, from Glynbox',
    pie: "You're getting this email because you have a Glynbox account.",
    baja: 'Unsubscribe',
    pelicula: 'Movie',
    serie: 'Series',
  },
} as const

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function linkFicha(t: { mediaType: MediaType; id: number }, campana: string, codigo: string): string {
  const qs = new URLSearchParams({
    utm_source: 'mail',
    utm_medium: 'email',
    utm_campaign: campana,
    utm_content: codigo,
  })
  return `${SITIO}/${t.mediaType}/${t.id}?${qs}`
}

export function linkBaja(token: string, idioma: Idioma): string {
  return `${SITIO}/mail/baja?${new URLSearchParams({ t: token, ...(idioma === 'en' ? { l: 'en' } : {}) })}`
}

/** La URL de un clic de baja de un solo paso (List-Unsubscribe-Post), sin página. */
export function linkBajaUnClic(token: string): string {
  return `${SITIO}/api/mail/baja?${new URLSearchParams({ t: token })}`
}

function filaTitulo(t: TituloMail, href: string, x: (typeof TEXTOS)[Idioma]): string {
  const meta = [t.mediaType === 'movie' ? x.pelicula : x.serie, t.anio].filter(Boolean).join(' · ')
  const poster = t.poster
    ? `<img src="${t.poster}" width="96" alt="${esc(t.titulo)}" style="display:block;width:96px;height:auto;border-radius:10px;border:0;">`
    : `<div style="width:96px;height:144px;border-radius:10px;background:#1C1C27;"></div>`
  return `
      <tr><td style="padding:0 0 16px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="96" valign="top" style="width:96px;"><a href="${href}" style="text-decoration:none;">${poster}</a></td>
            <td valign="middle" style="padding-left:16px;">
              <a href="${href}" style="color:#FFFFFF;font-size:17px;line-height:22px;font-weight:bold;text-decoration:none;">${esc(t.titulo)}</a>
              <div style="color:#6B6B7B;font-size:13px;line-height:18px;padding-top:4px;">${esc(meta)}</div>
              ${t.plataforma ? `<div style="padding-top:8px;"><span style="display:inline-block;background:#1C1C27;border:1px solid #2A2A3A;color:#FFFD02;font-size:12px;font-weight:bold;padding:4px 10px;border-radius:999px;">${x.en} ${esc(t.plataforma)}</span></div>` : ''}
              <div style="padding-top:10px;"><a href="${href}" style="color:#A0A0B0;font-size:13px;text-decoration:underline;">${x.verFicha} →</a></div>
            </td>
          </tr>
        </table>
      </td></tr>`
}

export function armarMail(
  c: Contenido,
  d: Pick<Destinatario, 'nombre' | 'codigo' | 'bajaToken'>,
  campana: Campana,
): { asunto: string; html: string; texto: string } {
  const x = TEXTOS[c.idioma]
  const plataforma = c.principal
  const primero = c.titulos[0]?.titulo ?? ''
  const asunto = plataforma
    ? campana.asunto === 3 && primero
      ? x.asunto[2](plataforma, primero)
      : x.asunto[campana.asunto === 2 ? 1 : 0](plataforma)
    : x.asuntoSinPlataforma

  const link = (t: { mediaType: MediaType; id: number }) => linkFicha(t, campana.nombre, d.codigo)
  const baja = linkBaja(d.bajaToken, c.idioma)
  const nombre = d.nombre?.trim() || null

  const reco = c.reco
  const bloqueReco = reco
    ? `
      <tr><td style="padding:8px 0 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1C1C27;border:1px solid #2A2A3A;border-radius:14px;">
          <tr><td style="padding:18px 18px 4px 18px;color:#FFFD02;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">${x.miReco}</td></tr>
          <tr><td style="padding:4px 18px 14px 18px;color:#FFFFFF;font-size:15px;line-height:22px;font-style:italic;">“${esc(reco.frase)}”</td></tr>
          <tr><td style="padding:0 18px 2px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filaTitulo(reco, link(reco), x)}</table>
          </td></tr>
        </table>
      </td></tr>`
    : ''

  const html = `<!doctype html>
<html lang="${c.idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:#0A0A0F;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0A0A0F;">${esc(x.preencabezado)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0F;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#13131A;border:1px solid #2A2A3A;border-radius:16px;">
      <tr><td style="padding:28px 24px 0 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="color:#FFFD02;font-size:22px;font-weight:bold;padding-bottom:18px;">Glynbox</td></tr>
          <tr><td style="color:#FFFFFF;font-size:20px;line-height:26px;font-weight:bold;padding-bottom:8px;">${esc(x.hola(nombre))}</td></tr>
          <tr><td style="color:#A0A0B0;font-size:15px;line-height:22px;padding-bottom:22px;">${esc(x.intro)}</td></tr>
          ${c.titulos.map(t => filaTitulo(t, link(t), x)).join('')}
          ${bloqueReco}
          <tr><td style="color:#A0A0B0;font-size:15px;line-height:22px;padding:22px 0 26px 0;">— ${x.firma}</td></tr>
        </table>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="color:#6B6B7B;font-size:12px;line-height:18px;padding:18px 24px;text-align:center;">
        ${x.pie}<br><a href="${baja}" style="color:#A0A0B0;text-decoration:underline;">${x.baja}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

  const lineas = [
    x.hola(nombre),
    '',
    x.intro,
    '',
    ...c.titulos.flatMap(t => [`• ${t.titulo}${t.plataforma ? ` (${x.en} ${t.plataforma})` : ''}`, `  ${link(t)}`]),
    ...(reco ? ['', `${x.miReco}: ${reco.titulo}${reco.plataforma ? ` (${x.en} ${reco.plataforma})` : ''}`, `“${reco.frase}”`, link(reco)] : []),
    '',
    `— ${x.firma}`,
    '',
    x.pie,
    `${x.baja}: ${baja}`,
  ]

  return { asunto, html, texto: lineas.join('\n') }
}
