import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'

/**
 * Imágenes para compartir: reseñas (historia y publicación), fichas de
 * películas y series (historia), calificaciones, listas y "Mi top 5"
 * (historia), y la vista previa de los links (la que muestran WhatsApp, X y
 * Facebook al pegar un link de glynbox.com).
 *
 * Las arma el servidor con `ImageResponse` (satori + resvg), así la web y la
 * app comparten exactamente la misma imagen. Satori no es un navegador: cada
 * div con más de un hijo necesita `display: flex`, no hay `line-clamp` (el
 * texto se corta acá antes de dibujarlo) y las fuentes van como archivos.
 */

/**
 * Arma la respuesta. La vista previa de links sale en JPEG: WhatsApp no
 * muestra imágenes de más de ~300 KB y el PNG con la foto de fondo pesa ~800.
 * Las historias, en JPEG si se pide con `?jpg=1` (`pideJpeg`): 150 KB en vez
 * de 2 MB, que el teléfono baja antes de abrir el menú de compartir. La app
 * lo pide desde el build del 23/10; las versiones anteriores guardan el
 * archivo como PNG y siguen recibiendo PNG.
 *
 * Caché en la CDN de Vercel con `Vercel-CDN-Cache-Control`, nunca con ISR (las
 * escrituras de ISR se cobran; ver next.config.ts). Una reseña privada —sólo
 * la ve su autor— no se cachea en ningún lado.
 */
export async function renderShareImage(
  element: ReactElement,
  size: { width: number; height: number },
  opts: { jpeg?: boolean; cache: 'publica' | 'privada' }
): Promise<Response> {
  const { fonts } = await loadShareAssets()
  const png = await new ImageResponse(element, { ...size, fonts }).arrayBuffer()
  const body = opts.jpeg
    ? await sharp(Buffer.from(png)).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    : Buffer.from(png)

  const headers: Record<string, string> =
    opts.cache === 'publica'
      ? { 'Cache-Control': 'public, max-age=3600', 'Vercel-CDN-Cache-Control': 'max-age=86400' }
      : { 'Cache-Control': 'private, no-store' }

  return new Response(new Uint8Array(body), {
    headers: { 'Content-Type': opts.jpeg ? 'image/jpeg' : 'image/png', ...headers },
  })
}

/** `?jpg=1`: la historia en JPEG (ver `renderShareImage`). */
export function pideJpeg(req: Request): boolean {
  return new URL(req.url).searchParams.get('jpg') === '1'
}

export const SIZES = {
  historia: { width: 1080, height: 1920 },
  publicacion: { width: 1080, height: 1350 },
  link: { width: 1200, height: 630 },
} as const

const C = {
  bg: '#0A0A0F',
  card: '#13131A',
  yellow: '#FFFD02',
  white: '#FFFFFF',
  muted: '#A0A0B0',
  border: '#2A2A3A',
}

const TMDB_IMG = 'https://image.tmdb.org/t/p'

/** El color del tilde de verificado, el mismo de `VerifiedBadge` de la app. */
const AZUL_VERIFICADO = '#1D9BF0'

// ---------------------------------------------------------------------------
// Fondo desenfocado, preparado antes de dibujar
// ---------------------------------------------------------------------------

/**
 * El fondo de las historias: la imagen de la película desenfocada. Antes lo
 * desenfocaba satori (`filter: blur`) sobre los 1080 × 1920 de la imagen, y
 * eso solo tardaba entre 0,7 y 1,4 s de los ~3 s que tardaba cada imagen
 * (23/10). Acá se baja la versión chica de TMDB y sharp la desenfoca a un
 * cuarto del tamaño: ~0,2 s, y el resultado es el mismo porque desenfocada no
 * tiene detalle que perder al estirarla.
 *
 * Se guardan las últimas en memoria: la misma película se comparte seguido.
 */
const fondos = new Map<string, Promise<string | null>>()
const FONDOS_EN_MEMORIA = 60

export function fondoDesenfocado(path: string | null): Promise<string | null> {
  if (!path) return Promise.resolve(null)
  let fondo = fondos.get(path)
  if (!fondo) {
    fondo = (async () => {
      try {
        const res = await fetch(`${TMDB_IMG}/w300${path}`, { signal: AbortSignal.timeout(5000) })
        if (!res.ok) return null
        const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
          .resize(270, 480, { fit: 'cover' })
          .blur(7)
          .jpeg({ quality: 70 })
          .toBuffer()
        return `data:image/jpeg;base64,${jpg.toString('base64')}`
      } catch {
        return null
      }
    })()
    fondos.set(path, fondo)
    if (fondos.size > FONDOS_EN_MEMORIA) fondos.delete(fondos.keys().next().value as string)
  }
  return fondo
}

// ---------------------------------------------------------------------------
// Recursos: fuentes y logo, leídos una vez por instancia
// ---------------------------------------------------------------------------

type Font = { name: string; data: Buffer; weight: 500 | 600 | 700 | 800; style: 'normal' }

let assets: Promise<{ fonts: Font[]; logo: string; logoOscuro: string }> | null = null

/**
 * El logo entero en el color del fondo, para ponerlo sobre amarillo (el pie de
 * las guías): el original es blanco y amarillo, y ahí se perdía. Se pinta cada
 * píxel con el color de fondo y se deja la transparencia como está.
 */
async function logoEnOscuro(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0x0a
    data[i + 1] = 0x0a
    data[i + 2] = 0x0f
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
}

export function loadShareAssets() {
  assets ??= (async () => {
    const dir = join(process.cwd(), 'assets', 'share-fonts')
    const font = async (file: string, name: string, weight: Font['weight']): Promise<Font> => ({
      name,
      weight,
      style: 'normal',
      data: await readFile(join(dir, file)),
    })
    const [fonts, logo] = await Promise.all([
      Promise.all([
        font('inter-tight-latin-800-normal.woff', 'Inter Tight', 800),
        font('inter-tight-latin-700-normal.woff', 'Inter Tight', 700),
        font('manrope-latin-500-normal.woff', 'Manrope', 500),
        font('manrope-latin-600-normal.woff', 'Manrope', 600),
        font('manrope-latin-700-normal.woff', 'Manrope', 700),
      ]),
      readFile(join(process.cwd(), 'public', 'logo.png')),
    ])
    return {
      fonts,
      logo: `data:image/png;base64,${logo.toString('base64')}`,
      logoOscuro: `data:image/png;base64,${(await logoEnOscuro(logo)).toString('base64')}`,
    }
  })()
  return assets
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Corta en el último espacio antes del límite y agrega "…". */
export function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?¡¿-]+$/, '')}…`
}

/** Una estrella: llena, media o vacía. La media es un degradé cortado al 50 %. */
function Star({ fill, size }: { fill: 0 | 0.5 | 1; size: number }) {
  const id = `half-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {fill === 0.5 && (
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
            <stop offset="50%" stopColor={C.yellow} />
            <stop offset="50%" stopColor="rgba(255,255,255,0.18)" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 1.8l3.09 6.26 6.91 1-5 4.87 1.18 6.88L12 17.56l-6.18 3.25L7 13.93l-5-4.87 6.91-1z"
        fill={fill === 1 ? C.yellow : fill === 0.5 ? `url(#${id})` : 'rgba(255,255,255,0.18)'}
      />
    </svg>
  )
}

export function Stars({ rating, size, gap }: { rating: number; size: number; gap: number }) {
  return (
    <div style={{ display: 'flex', gap }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={size} fill={rating >= n ? 1 : rating >= n - 0.5 ? 0.5 : 0} />
      ))}
    </div>
  )
}

/**
 * Fondo: la imagen de la película desenfocada, con un degradé que la oscurece.
 * Con `fondoDesenfocado` ya viene desenfocada y se estira nomás; si no se pudo
 * preparar, la desenfoca satori como antes (más lento, pero sale).
 */
function Backdrop({ url, width, height }: { url: string | null; width: number; height: number }) {
  return (
    <div style={{ display: 'flex', position: 'absolute', inset: 0, background: C.bg }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={width}
          height={height}
          style={
            url.startsWith('data:')
              ? { position: 'absolute', inset: 0, width, height, objectFit: 'cover', opacity: 0.55 }
              : {
                  position: 'absolute',
                  inset: 0,
                  width,
                  height,
                  objectFit: 'cover',
                  filter: 'blur(28px)',
                  opacity: 0.55,
                  transform: 'scale(1.15)',
                }
          }
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, rgba(10,10,15,0.35) 0%, rgba(10,10,15,0.75) 45%, ${C.bg} 100%)`,
        }}
      />
    </div>
  )
}

function Poster({ path, width }: { path: string | null; width: number }) {
  const height = Math.round(width * 1.5)
  return path ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${TMDB_IMG}/w780${path}`}
      alt=""
      width={width}
      height={height}
      style={{
        width,
        height,
        borderRadius: 24,
        objectFit: 'cover',
        // Un borde y no una sombra: la sombra desenfocada le sumaba ~0,4 s a
        // cada imagen (23/10).
        border: '2px solid rgba(255,255,255,0.12)',
      }}
    />
  ) : (
    <div style={{ display: 'flex', width, height, borderRadius: 24, background: C.card }} />
  )
}

function Logo({ src, height }: { src: string; height: number }) {
  // El logo mide 2098 × 437.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Glynbox" height={height} width={Math.round((height * 2098) / 437)} />
}

/** El tilde de verificado, como `VerifiedBadge` de la app. */
function Tilde({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="10" fill={AZUL_VERIFICADO} />
      <path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function Author({
  username,
  avatarUrl,
  verified,
  size,
}: {
  username: string
  avatarUrl: string | null
  verified: boolean
  size: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.3 }}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, borderRadius: size, objectFit: 'cover', border: `3px solid ${C.yellow}` }}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            width: size,
            height: size,
            borderRadius: size,
            background: C.yellow,
            color: C.bg,
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.45,
            fontFamily: 'Inter Tight',
            fontWeight: 800,
          }}
        >
          {username.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.14 }}>
        <div style={{ display: 'flex', fontSize: size * 0.45, color: C.white, fontFamily: 'Manrope', fontWeight: 700 }}>
          @{username}
        </div>
        {verified && <Tilde size={Math.round(size * 0.42)} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Datos que usan los diseños
// ---------------------------------------------------------------------------

export type ShareMedia = {
  title: string
  year: string | null
  posterPath: string | null
  backdropPath: string | null
  /** Puntaje de TMDB sobre 10, o null si no tiene votos. */
  tmdbScore: number | null
  kind: 'movie' | 'tv'
  /** El fondo ya desenfocado (`fondoDesenfocado`), o null si no se pudo. */
  fondo: string | null
}

export type ShareReview = {
  media: ShareMedia
  rating: number | null
  body: string | null
  hasSpoiler: boolean
  username: string
  avatarUrl: string | null
  verified: boolean
}

function backdropUrl(m: ShareMedia) {
  if (m.fondo) return m.fondo
  if (m.backdropPath) return `${TMDB_IMG}/w780${m.backdropPath}`
  if (m.posterPath) return `${TMDB_IMG}/w500${m.posterPath}`
  return null
}

function Quote({ review, max, fontSize }: { review: ShareReview; max: number; fontSize: number }) {
  if (review.hasSpoiler) {
    return (
      <div style={{ display: 'flex', fontSize: fontSize * 0.85, color: C.muted, fontFamily: 'Manrope', fontWeight: 600 }}>
        Contiene spoilers · leela completa en Glynbox
      </div>
    )
  }
  if (!review.body?.trim()) return null
  return (
    <div
      style={{
        display: 'flex',
        fontSize,
        lineHeight: 1.4,
        color: 'rgba(255,255,255,0.92)',
        fontFamily: 'Manrope',
        fontWeight: 500,
      }}
    >
      “{excerpt(review.body, max)}”
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diseños
// ---------------------------------------------------------------------------

/** Reseña, 1080 × 1920: historias de Instagram y Facebook, estados de WhatsApp. */
export function ReviewStory({ review, logo }: { review: ShareReview; logo: string }) {
  const { width, height } = SIZES.historia
  const m = review.media
  return (
    <div style={{ display: 'flex', width, height, position: 'relative', background: C.bg }}>
      <Backdrop url={backdropUrl(m)} width={width} height={height} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width,
          height,
          padding: '110px 90px 90px',
          position: 'relative',
        }}
      >
        <Logo src={logo} height={58} />
        <div style={{ display: 'flex', marginTop: 90 }}>
          <Poster path={m.posterPath} width={520} />
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 64,
            fontSize: m.title.length > 28 ? 64 : 80,
            lineHeight: 1.05,
            color: C.white,
            fontFamily: 'Inter Tight',
            fontWeight: 800,
            textAlign: 'center',
            justifyContent: 'center',
          }}
        >
          {m.title}
        </div>
        {m.year && (
          <div style={{ display: 'flex', marginTop: 14, fontSize: 40, color: C.muted, fontFamily: 'Manrope', fontWeight: 600 }}>
            {m.year}
          </div>
        )}
        {review.rating !== null && (
          <div style={{ display: 'flex', marginTop: 44 }}>
            <Stars rating={review.rating} size={84} gap={14} />
          </div>
        )}
        <div style={{ display: 'flex', marginTop: 48, textAlign: 'center', justifyContent: 'center' }}>
          <Quote review={review} max={170} fontSize={42} />
        </div>
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <Author username={review.username} avatarUrl={review.avatarUrl} verified={review.verified} size={76} />
        <div style={{ display: 'flex', marginTop: 26, fontSize: 32, color: C.muted, fontFamily: 'Manrope', fontWeight: 600 }}>
          glynbox.com
        </div>
      </div>
    </div>
  )
}

/** Reseña, 1080 × 1350: publicación de Instagram y Facebook (4:5). */
export function ReviewPost({ review, logo }: { review: ShareReview; logo: string }) {
  const { width, height } = SIZES.publicacion
  const m = review.media
  return (
    <div style={{ display: 'flex', width, height, position: 'relative', background: C.bg }}>
      <Backdrop url={backdropUrl(m)} width={width} height={height} />
      <div style={{ display: 'flex', flexDirection: 'column', width, height, padding: 80, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo src={logo} height={48} />
          <div style={{ display: 'flex', fontSize: 28, color: C.muted, fontFamily: 'Manrope', fontWeight: 600 }}>
            glynbox.com
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 70, gap: 56 }}>
          <Poster path={m.posterPath} width={400} />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
            <div
              style={{
                display: 'flex',
                fontSize: m.title.length > 22 ? 56 : 68,
                lineHeight: 1.05,
                color: C.white,
                fontFamily: 'Inter Tight',
                fontWeight: 800,
              }}
            >
              {m.title}
            </div>
            {m.year && (
              <div style={{ display: 'flex', marginTop: 12, fontSize: 34, color: C.muted, fontFamily: 'Manrope', fontWeight: 600 }}>
                {m.year}
              </div>
            )}
            {review.rating !== null && (
              <div style={{ display: 'flex', marginTop: 36 }}>
                <Stars rating={review.rating} size={64} gap={10} />
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 64 }}>
          <Quote review={review} max={210} fontSize={38} />
        </div>
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <Author username={review.username} avatarUrl={review.avatarUrl} verified={review.verified} size={68} />
      </div>
    </div>
  )
}

function Score({ score, size }: { score: number; size: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: size * 0.25,
        padding: `${size * 0.3}px ${size * 0.55}px`,
        borderRadius: size,
        background: 'rgba(255,253,2,0.12)',
        border: `2px solid ${C.yellow}`,
      }}
    >
      <Star fill={1} size={size} />
      <div style={{ display: 'flex', fontSize: size, color: C.white, fontFamily: 'Inter Tight', fontWeight: 800 }}>
        {score.toFixed(1)}
      </div>
      <div style={{ display: 'flex', fontSize: size * 0.6, color: C.muted, fontFamily: 'Manrope', fontWeight: 700 }}>
        TMDB
      </div>
    </div>
  )
}

/** Ficha de película o serie, 1080 × 1920: "mirá esta" para pasarle a alguien. */
export function MediaStory({ media: m, logo }: { media: ShareMedia; logo: string }) {
  const { width, height } = SIZES.historia
  return (
    <div style={{ display: 'flex', width, height, position: 'relative', background: C.bg }}>
      <Backdrop url={backdropUrl(m)} width={width} height={height} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width,
          height,
          padding: '110px 90px 100px',
          position: 'relative',
        }}
      >
        <Logo src={logo} height={58} />
        <div style={{ display: 'flex', marginTop: 110 }}>
          <Poster path={m.posterPath} width={620} />
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 70,
            fontSize: m.title.length > 28 ? 68 : 86,
            lineHeight: 1.05,
            color: C.white,
            fontFamily: 'Inter Tight',
            fontWeight: 800,
            textAlign: 'center',
            justifyContent: 'center',
          }}
        >
          {m.title}
        </div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 40, color: C.muted, fontFamily: 'Manrope', fontWeight: 600 }}>
          {[m.kind === 'tv' ? 'Serie' : 'Película', m.year].filter(Boolean).join(' · ')}
        </div>
        {m.tmdbScore !== null && (
          <div style={{ display: 'flex', marginTop: 44 }}>
            <Score score={m.tmdbScore} size={52} />
          </div>
        )}
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <div
          style={{
            display: 'flex',
            padding: '26px 56px',
            borderRadius: 60,
            background: C.yellow,
            color: C.bg,
            fontSize: 38,
            fontFamily: 'Inter Tight',
            fontWeight: 800,
          }}
        >
          Mirala en glynbox.com
        </div>
      </div>
    </div>
  )
}

/** Vista previa de links, 1200 × 630: la que arman WhatsApp, X y Facebook. */
export function LinkPreview({
  media: m,
  logo,
  review,
}: {
  media: ShareMedia
  logo: string
  review?: ShareReview
}) {
  const { width, height } = SIZES.link
  return (
    <div style={{ display: 'flex', width, height, position: 'relative', background: C.bg }}>
      <Backdrop url={backdropUrl(m)} width={width} height={height} />
      <div style={{ display: 'flex', width, height, padding: 60, gap: 56, position: 'relative', alignItems: 'center' }}>
        <Poster path={m.posterPath} width={340} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: 510 }}>
          <Logo src={logo} height={40} />
          <div style={{ display: 'flex', flexGrow: 1 }} />
          {review && (
            <div style={{ display: 'flex', marginBottom: 20 }}>
              <Author username={review.username} avatarUrl={review.avatarUrl} verified={review.verified} size={56} />
            </div>
          )}
          <div
            style={{
              display: 'flex',
              fontSize: m.title.length > 24 ? 54 : 66,
              lineHeight: 1.05,
              color: C.white,
              fontFamily: 'Inter Tight',
              fontWeight: 800,
            }}
          >
            {m.title}
          </div>
          <div style={{ display: 'flex', marginTop: 12, fontSize: 30, color: C.muted, fontFamily: 'Manrope', fontWeight: 600 }}>
            {[m.kind === 'tv' ? 'Serie' : 'Película', m.year].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex', marginTop: 30 }}>
            {review?.rating != null ? (
              <Stars rating={review.rating} size={56} gap={8} />
            ) : m.tmdbScore !== null ? (
              <Score score={m.tmdbScore} size={40} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Historias de "compartí" (octubre de 2026): calificación, lista y top 5
// ---------------------------------------------------------------------------
//
// Las tres terminan igual: el logo con "Descubrí qué ver en Glynbox" sobre una
// franja amarilla. Es lo único que queda de Glynbox en una historia de
// Instagram, que no deja poner un link: tiene que decir qué es y dónde.

/** El pie de las historias de compartir. */
function PieMarca({ logo }: { logo: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
      <Logo src={logo} height={60} />
      <div
        style={{
          display: 'flex',
          padding: '22px 52px',
          borderRadius: 60,
          background: C.yellow,
          color: C.bg,
          fontSize: 38,
          fontFamily: 'Inter Tight',
          fontWeight: 800,
        }}
      >
        Descubrí qué ver en Glynbox
      </div>
    </div>
  )
}

/** Un póster de la grilla, con su puesto si lo tiene (top 5). */
function PosterGrilla({ path, width, puesto }: { path: string | null; width: number; puesto?: number }) {
  const height = Math.round(width * 1.5)
  return (
    <div style={{ display: 'flex', position: 'relative', width, height }}>
      {path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${TMDB_IMG}/w500${path}`}
          alt=""
          width={width}
          height={height}
          style={{ width, height, borderRadius: 18, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.12)' }}
        />
      ) : (
        <div style={{ display: 'flex', width, height, borderRadius: 18, background: C.card }} />
      )}
      {puesto !== undefined && (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: -18,
            left: -18,
            width: 72,
            height: 72,
            borderRadius: 72,
            background: C.yellow,
            color: C.bg,
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 40,
            fontFamily: 'Inter Tight',
            fontWeight: 800,
          }}
        >
          {puesto}
        </div>
      )}
    </div>
  )
}

/**
 * Hasta 6 pósters en filas de 3; la última fila, centrada. Con 4, dos filas de
 * 2: 3 + 1 dejaba uno solo abajo.
 */
function Grilla({ posters, width, numerados }: { posters: (string | null)[]; width: number; numerados?: boolean }) {
  const porFila = posters.length === 4 ? 2 : 3
  const filas: (string | null)[][] = []
  for (let i = 0; i < posters.length; i += porFila) filas.push(posters.slice(i, i + porFila))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34, alignItems: 'center' }}>
      {filas.map((fila, f) => (
        <div key={f} style={{ display: 'flex', gap: 30 }}>
          {fila.map((p, i) => (
            <PosterGrilla key={i} path={p} width={width} puesto={numerados ? f * porFila + i + 1 : undefined} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Fondo de las historias de grilla: oscuro con un brillo amarillo arriba. */
function FondoMarca({ width, height }: { width: number; height: number }) {
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        inset: 0,
        width,
        height,
        background: `radial-gradient(circle at 50% 0%, rgba(255,253,2,0.22) 0%, rgba(255,253,2,0.05) 38%, ${C.bg} 70%)`,
      }}
    />
  )
}

export type ShareCalificacion = {
  media: ShareMedia
  rating: number
  /** La reseña, si escribió una (sin spoilers). */
  body: string | null
  username: string
  avatarUrl: string | null
  verified: boolean
}

/** "Compartí tu calificación", 1080 × 1920: póster grande, estrellas, @usuario y la frase. */
export function CalificacionStory({ c, logo }: { c: ShareCalificacion; logo: string }) {
  const { width, height } = SIZES.historia
  const m = c.media
  return (
    <div style={{ display: 'flex', width, height, position: 'relative', background: C.bg }}>
      <Backdrop url={backdropUrl(m)} width={width} height={height} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width,
          height,
          padding: '120px 90px 100px',
          position: 'relative',
        }}
      >
        <Poster path={m.posterPath} width={600} />
        <div
          style={{
            display: 'flex',
            marginTop: 60,
            fontSize: m.title.length > 28 ? 62 : 78,
            lineHeight: 1.05,
            color: C.white,
            fontFamily: 'Inter Tight',
            fontWeight: 800,
            textAlign: 'center',
            justifyContent: 'center',
          }}
        >
          {m.title}
        </div>
        <div style={{ display: 'flex', marginTop: 40 }}>
          <Stars rating={c.rating} size={92} gap={16} />
        </div>
        <div style={{ display: 'flex', marginTop: 40 }}>
          <Author username={c.username} avatarUrl={c.avatarUrl} verified={c.verified} size={70} />
        </div>
        {c.body?.trim() && (
          <div
            style={{
              display: 'flex',
              marginTop: 36,
              fontSize: 40,
              lineHeight: 1.4,
              color: 'rgba(255,255,255,0.92)',
              fontFamily: 'Manrope',
              fontWeight: 500,
              textAlign: 'center',
              justifyContent: 'center',
            }}
          >
            “{excerpt(c.body, 140)}”
          </div>
        )}
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <PieMarca logo={logo} />
      </div>
    </div>
  )
}

export type ShareListaItem = {
  title: string
  year: number | null
  posterPath: string | null
}

/**
 * Una lista, o una guía: las dos usan la misma historia (`ListaStory`).
 */
export type ShareLista = {
  title: string
  description: string | null
  /** Quien la armó. `null` en las guías, que son de Glynbox: el pie lleva sólo el logo. */
  autor: { username: string; avatarUrl: string | null; verified: boolean } | null
  total: number
  /** Los primeros 10, en orden. */
  items: ShareListaItem[]
  /** La imagen de arriba, ya recortada (`portadaLista` o `portadaGuia`), o null. */
  portada: string | null
  /** Sólo guías: los títulos van en orden de estreno, y se dibujan con una línea de tiempo. */
  cronologica?: boolean
}

/**
 * Las medidas de la historia de la lista. Las zonas seguras son las de
 * Instagram: arriba van la barra de progreso y el nombre de la cuenta, abajo
 * "Enviar mensaje". Ahí no va texto; la portada sí, porque es fondo.
 */
const LISTA = {
  portada: 640,
  margen: 64,
  seguroArriba: 230,
  seguroAbajo: 250,
  /** Entre la portada y los pósters: a la derecha va el sticker de enlace. */
  franja: 130,
  pie: 84,
  /** La parte de la franja amarilla del pie de las guías que queda arriba de la zona segura. */
  pieGuia: 120,
  porColumna: 5,
} as const

/**
 * La portada de "Compartir lista": la imagen horizontal (backdrop) de TMDB de
 * la primera, recortada al tamaño de la portada. Como `fondoDesenfocado`, la
 * prepara sharp antes de dibujar, y se guardan las últimas en memoria.
 */
const portadas = new Map<string, Promise<string | null>>()

/** Recorta una imagen al tamaño de la portada y la deja lista para satori. */
async function recortarPortada(imagen: Buffer): Promise<string> {
  const jpg = await sharp(imagen)
    .resize(SIZES.historia.width, LISTA.portada, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toBuffer()
  return `data:image/jpeg;base64,${jpg.toString('base64')}`
}

function recordar(clave: string, armar: () => Promise<string | null>): Promise<string | null> {
  let portada = portadas.get(clave)
  if (!portada) {
    portada = armar().catch(() => null)
    portadas.set(clave, portada)
    if (portadas.size > FONDOS_EN_MEMORIA) portadas.delete(portadas.keys().next().value as string)
  }
  return portada
}

export function portadaLista(path: string | null): Promise<string | null> {
  if (!path) return Promise.resolve(null)
  return recordar(path, async () => {
    const res = await fetch(`${TMDB_IMG}/w1280${path}`, { signal: AbortSignal.timeout(5000) })
    return res.ok ? recortarPortada(Buffer.from(await res.arrayBuffer())) : null
  })
}

/**
 * La portada de una guía: su imagen de `public/guias/`, leída del disco (por
 * HTTP la frena el firewall, ver `/api/guias/portada`).
 */
export function portadaGuia(heroImage: string): Promise<string | null> {
  return recordar(heroImage, async () => recortarPortada(await readFile(join(process.cwd(), 'public', heroImage))))
}

/**
 * La foto de perfil lista para satori, que no lee WebP: desde que las fotos se
 * guardan en WebP (e6b97e2) salía el círculo vacío. sharp la pasa a JPEG
 * chico. Si no se puede, null y queda la inicial.
 */
export async function avatarParaImagen(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(160, 160, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpg.toString('base64')}`
  } catch {
    return null
  }
}

/** El póster de una fila de la lista o de la guía. */
function PosterFila({ path, alto }: { path: string | null; alto: number }) {
  const ancho = Math.round((alto * 2) / 3)
  return path ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${TMDB_IMG}/w185${path}`}
      alt=""
      width={ancho}
      height={alto}
      style={{
        width: ancho,
        height: alto,
        flexShrink: 0,
        borderRadius: 12,
        objectFit: 'cover',
        border: '2px solid rgba(255,255,255,0.12)',
      }}
    />
  ) : (
    <div style={{ display: 'flex', width: ancho, height: alto, flexShrink: 0, borderRadius: 12, background: C.card }} />
  )
}

/** El título de una fila: hasta dos líneas (`lineClamp` corta con "…"), y el año abajo si va. */
function TextoFila({ item, ancho, grande, conAnio }: { item: ShareListaItem; ancho: number; grande: boolean; conAnio: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: ancho, marginLeft: 22 }}>
      <div
        style={{
          display: 'block',
          lineClamp: 2,
          fontSize: grande ? 38 : 29,
          lineHeight: 1.15,
          color: C.white,
          fontFamily: 'Inter Tight',
          fontWeight: 700,
        }}
      >
        {item.title}
      </div>
      {conAnio && item.year && (
        <div
          style={{
            display: 'flex',
            marginTop: 6,
            fontSize: grande ? 30 : 24,
            color: C.muted,
            fontFamily: 'Manrope',
            fontWeight: 600,
          }}
        >
          {item.year}
        </div>
      )}
    </div>
  )
}

/** Un título de la lista: puesto, póster, título y año. */
function FilaLista({
  item,
  puesto,
  alto,
  ancho,
  grande,
}: {
  item: ShareListaItem
  puesto: number
  alto: number
  ancho: number
  grande: boolean
}) {
  const numero = grande ? 64 : 54
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: ancho, height: alto }}>
      <div
        style={{
          display: 'flex',
          width: numero,
          flexShrink: 0,
          fontSize: grande ? 48 : 40,
          color: C.yellow,
          fontFamily: 'Inter Tight',
          fontWeight: 800,
        }}
      >
        {puesto}
      </div>
      <PosterFila path={item.posterPath} alto={alto} />
      <TextoFila item={item} ancho={ancho - numero - Math.round((alto * 2) / 3) - 22} grande={grande} conAnio />
    </div>
  )
}

/** Las medidas de la línea de tiempo de las guías cronológicas. */
function medidasLinea(grande: boolean) {
  return { anio: grande ? 108 : 82, eje: grande ? 40 : 32, punto: grande ? 22 : 18 }
}

/**
 * Un título de una guía cronológica: el año en amarillo, el punto sobre la
 * línea de tiempo, el póster y el título. La línea la dibuja la columna
 * (`ColumnaLinea`), que sabe dónde empieza y dónde termina.
 */
function FilaLinea({ item, alto, ancho, grande }: { item: ShareListaItem; alto: number; ancho: number; grande: boolean }) {
  const m = medidasLinea(grande)
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: ancho, height: alto }}>
      <div
        style={{
          display: 'flex',
          width: m.anio,
          flexShrink: 0,
          fontSize: grande ? 38 : 29,
          color: C.yellow,
          fontFamily: 'Inter Tight',
          fontWeight: 800,
        }}
      >
        {item.year}
      </div>
      <div style={{ display: 'flex', width: m.eje, flexShrink: 0, justifyContent: 'center' }}>
        <div
          style={{
            display: 'flex',
            width: m.punto,
            height: m.punto,
            borderRadius: m.punto,
            background: C.yellow,
            border: `4px solid ${C.bg}`,
          }}
        />
      </div>
      <PosterFila path={item.posterPath} alto={alto} />
      <TextoFila
        item={item}
        ancho={ancho - m.anio - m.eje - Math.round((alto * 2) / 3) - 22}
        grande={grande}
        conAnio={false}
      />
    </div>
  )
}

/** Una columna de la guía cronológica: la línea vertical detrás, de punto a punto. */
function ColumnaLinea({
  items,
  alto,
  ancho,
  gap,
  grande,
}: {
  items: ShareListaItem[]
  alto: number
  ancho: number
  gap: number
  grande: boolean
}) {
  const m = medidasLinea(grande)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, width: ancho, position: 'relative' }}>
      {/* Primero, para que los puntos queden encima. */}
      {items.length > 1 && (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: m.anio + m.eje / 2 - 2,
            top: alto / 2,
            width: 4,
            height: (items.length - 1) * (alto + gap),
            borderRadius: 4,
            background: 'rgba(255,253,2,0.45)',
          }}
        />
      )}
      {items.map((item, i) => (
        <FilaLinea key={i} item={item} alto={alto} ancho={ancho} grande={grande} />
      ))}
    </div>
  )
}

/**
 * "Compartir lista" y "Compartir guía", 1080 × 1920.
 *
 * Arriba la portada, oscurecida hacia abajo, con el título en mayúsculas.
 * Después una franja con la cantidad a la izquierda y la derecha libre para el
 * sticker de enlace de Instagram, que se pega a mano y no tiene que tapar
 * nada. Abajo los primeros 10: del 1 al 5 a la izquierda y del 6 al 10 a la
 * derecha; con 5 o menos, una sola columna más grande.
 *
 * Una lista lleva la descripción arriba del título, los títulos numerados y al
 * pie @quien la armó y el logo. Una guía (`autor: null`) tiene que notarse que
 * es de Glynbox: el sello "GUÍA GLYNBOX" arriba de la portada, la descripción
 * debajo del título, una línea de tiempo con los años en vez de números si es
 * cronológica, y el pie amarillo con el logo.
 */
export function ListaStory({ l, logo, logoOscuro }: { l: ShareLista; logo: string; logoOscuro: string }) {
  const { width, height } = SIZES.historia
  const { margen } = LISTA
  const esGuia = l.autor === null
  const linea = esGuia && l.cronologica === true
  const resto = l.total - l.items.length
  const dosColumnas = l.items.length > LISTA.porColumna
  const columnas = dosColumnas
    ? [l.items.slice(0, LISTA.porColumna), l.items.slice(LISTA.porColumna)]
    : [l.items]
  const gapColumnas = 40
  const anchoColumna = dosColumnas ? (width - 2 * margen - gapColumnas) / 2 : width - 2 * margen
  const gapFilas = dosColumnas ? 18 : 26

  // El pie de la guía es una franja amarilla hasta el borde: el logo va en la
  // parte de arriba y lo de abajo queda detrás de "Enviar mensaje".
  const pie = esGuia ? LISTA.pieGuia + LISTA.seguroAbajo : LISTA.pie + LISTA.seguroAbajo

  // El alto de cada fila: lo que queda entre la franja y el pie, repartido.
  const disponible = height - LISTA.portada - LISTA.franja - (resto > 0 ? 70 : 0) - 40 - pie
  const filas = dosColumnas ? LISTA.porColumna : Math.max(l.items.length, 1)
  const alto = Math.min(dosColumnas ? 150 : 210, Math.floor((disponible - (filas - 1) * gapFilas) / filas))

  const titulo = excerpt(l.title, 70).toUpperCase()
  const tamTitulo = titulo.length <= 14 ? 104 : titulo.length <= 26 ? 84 : titulo.length <= 44 ? 66 : 56

  const descripcion = l.description?.trim() ? (
    <div
      style={{
        display: 'block',
        lineClamp: 2,
        fontSize: 30,
        lineHeight: 1.35,
        color: 'rgba(255,255,255,0.82)',
        fontFamily: 'Manrope',
        fontWeight: 600,
        ...(esGuia ? { marginTop: 18 } : { marginBottom: 16 }),
      }}
    >
      {excerpt(l.description, 120)}
    </div>
  ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width, height, position: 'relative', background: C.bg }}>
      {/* Portada */}
      <div style={{ display: 'flex', position: 'relative', width, height: LISTA.portada, flexShrink: 0 }}>
        {l.portada ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={l.portada}
            alt=""
            width={width}
            height={LISTA.portada}
            style={{ position: 'absolute', inset: 0, width, height: LISTA.portada, objectFit: 'cover' }}
          />
        ) : (
          <FondoMarca width={width} height={LISTA.portada} />
        )}
        {/* Con medidas explícitas: un div vacío con `inset: 0` satori no lo dibuja. */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height: LISTA.portada,
            background: `linear-gradient(180deg, rgba(10,10,15,0.3) 0%, rgba(10,10,15,0.55) 35%, rgba(10,10,15,0.9) 72%, ${C.bg} 100%)`,
          }}
        />
        {/* El sello de las guías, arriba de todo pero debajo de la barra de Instagram. */}
        {esGuia && (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              left: margen,
              top: LISTA.seguroArriba,
              padding: '14px 26px',
              borderRadius: 12,
              background: C.yellow,
              color: C.bg,
              fontSize: 34,
              letterSpacing: 4,
              fontFamily: 'Inter Tight',
              fontWeight: 800,
            }}
          >
            GUÍA GLYNBOX
          </div>
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            position: 'absolute',
            left: margen,
            right: margen,
            // Con el sello, el texto empieza más abajo para no pisarlo.
            top: LISTA.seguroArriba + (esGuia ? 96 : 0),
            bottom: 24,
          }}
        >
          {!esGuia && (
            <div style={{ display: 'flex', width: 72, height: 8, borderRadius: 8, background: C.yellow, marginBottom: 26 }} />
          )}
          {!esGuia && descripcion}
          <div
            style={{
              display: 'block',
              lineClamp: 3,
              fontSize: tamTitulo,
              lineHeight: 1.02,
              letterSpacing: -1,
              color: C.white,
              fontFamily: 'Inter Tight',
              fontWeight: 800,
            }}
          >
            {titulo}
          </div>
          {esGuia && descripcion}
        </div>
      </div>

      {/* La franja del sticker: la cantidad a la izquierda, la derecha libre. */}
      <div style={{ display: 'flex', alignItems: 'center', height: LISTA.franja, flexShrink: 0, paddingLeft: margen }}>
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            letterSpacing: 3,
            color: C.yellow,
            fontFamily: 'Inter Tight',
            fontWeight: 800,
          }}
        >
          {l.total} {l.total === 1 ? 'TÍTULO' : 'TÍTULOS'}
        </div>
      </div>

      {/* Los pósters */}
      <div style={{ display: 'flex', gap: gapColumnas, paddingLeft: margen, paddingRight: margen }}>
        {columnas.map((columna, c) =>
          linea ? (
            <ColumnaLinea key={c} items={columna} alto={alto} ancho={anchoColumna} gap={gapFilas} grande={!dosColumnas} />
          ) : (
            <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: gapFilas, width: anchoColumna }}>
              {columna.map((item, i) => (
                <FilaLista
                  key={i}
                  item={item}
                  puesto={c * LISTA.porColumna + i + 1}
                  alto={alto}
                  ancho={anchoColumna}
                  grande={!dosColumnas}
                />
              ))}
            </div>
          )
        )}
      </div>
      {resto > 0 && (
        <div
          style={{
            display: 'flex',
            marginTop: 34,
            paddingLeft: margen,
            fontSize: 32,
            color: C.yellow,
            fontFamily: 'Manrope',
            fontWeight: 700,
          }}
        >
          +{resto} más en Glynbox
        </div>
      )}

      <div style={{ display: 'flex', flexGrow: 1 }} />
      {esGuia ? (
        // El pie de la guía: amarillo hasta el borde, con el logo oscuro
        // arriba de la zona segura.
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width,
            height: pie,
            paddingBottom: LISTA.seguroAbajo,
            background: C.yellow,
          }}
        >
          <Logo src={logoOscuro} height={60} />
        </div>
      ) : (
        // El pie de la lista, arriba de la zona segura de abajo.
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: LISTA.pie,
            marginLeft: margen,
            marginRight: margen,
            marginBottom: LISTA.seguroAbajo,
            paddingTop: 24,
            borderTop: `2px solid ${C.border}`,
          }}
        >
          {l.autor && (
            <Author username={l.autor.username} avatarUrl={l.autor.avatarUrl} verified={l.autor.verified} size={56} />
          )}
          <Logo src={logo} height={44} />
        </div>
      )}
    </div>
  )
}

export type ShareTop5 = {
  username: string
  avatarUrl: string | null
  verified: boolean
  posters: (string | null)[]
}

/**
 * "Compartir mi top", 1080 × 1920: las favoritas que fijó en el perfil (hasta
 * 4), numeradas. Con 4, más grandes en 2 × 2.
 */
export function Top5Story({ t, logo }: { t: ShareTop5; logo: string }) {
  const { width, height } = SIZES.historia
  return (
    <div style={{ display: 'flex', width, height, position: 'relative', background: C.bg }}>
      <FondoMarca width={width} height={height} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width,
          height,
          padding: '120px 80px 100px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', fontSize: 96, color: C.white, fontFamily: 'Inter Tight', fontWeight: 800 }}>
          Mi top {t.posters.length}
        </div>
        <div style={{ display: 'flex', marginTop: 30 }}>
          <Author username={t.username} avatarUrl={t.avatarUrl} verified={t.verified} size={64} />
        </div>
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <Grilla posters={t.posters} width={t.posters.length === 4 ? 380 : 286} numerados />
        <div style={{ display: 'flex', flexGrow: 1 }} />
        <PieMarca logo={logo} />
      </div>
    </div>
  )
}
