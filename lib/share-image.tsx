import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'

/**
 * Imágenes para compartir: reseñas (historia y publicación), fichas de
 * películas y series (historia) y la vista previa de los links (la que muestran
 * WhatsApp, X y Facebook al pegar un link de glynbox.com).
 *
 * Las arma el servidor con `ImageResponse` (satori + resvg), así la web y la
 * app comparten exactamente la misma imagen. Satori no es un navegador: cada
 * div con más de un hijo necesita `display: flex`, no hay `line-clamp` (el
 * texto se corta acá antes de dibujarlo) y las fuentes van como archivos.
 */

/**
 * Arma la respuesta. La vista previa de links sale en JPEG: WhatsApp no
 * muestra imágenes de más de ~300 KB y el PNG con la foto de fondo pesa ~800.
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

// ---------------------------------------------------------------------------
// Recursos: fuentes y logo, leídos una vez por instancia
// ---------------------------------------------------------------------------

type Font = { name: string; data: Buffer; weight: 500 | 600 | 700 | 800; style: 'normal' }

let assets: Promise<{ fonts: Font[]; logo: string }> | null = null

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
    return { fonts, logo: `data:image/png;base64,${logo.toString('base64')}` }
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

/** Fondo: la imagen de la película desenfocada, con un degradé que la oscurece. */
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
          style={{
            position: 'absolute',
            inset: 0,
            width,
            height,
            objectFit: 'cover',
            filter: 'blur(28px)',
            opacity: 0.55,
            transform: 'scale(1.15)',
          }}
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
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
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

function Author({ username, avatarUrl, size }: { username: string; avatarUrl: string | null; size: number }) {
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
      <div style={{ display: 'flex', fontSize: size * 0.45, color: C.white, fontFamily: 'Manrope', fontWeight: 700 }}>
        @{username}
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
}

export type ShareReview = {
  media: ShareMedia
  rating: number | null
  body: string | null
  hasSpoiler: boolean
  username: string
  avatarUrl: string | null
}

function backdropUrl(m: ShareMedia) {
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
        <Author username={review.username} avatarUrl={review.avatarUrl} size={76} />
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
        <Author username={review.username} avatarUrl={review.avatarUrl} size={68} />
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
              <Author username={review.username} avatarUrl={review.avatarUrl} size={56} />
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
