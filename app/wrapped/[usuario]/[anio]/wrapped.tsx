import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Idioma } from '@/lib/idioma'
import { cargarWrapped } from '@/lib/wrapped-datos'
import {
  anioDeRuta, rutaImagenWrapped, rutaWrapped, textosWrapped, wrappedAbierto,
  type WrappedVista,
} from '@/lib/wrapped'
import BotonDescargarWrapped from './BotonDescargarWrapped'

/**
 * La página del Wrapped, en castellano (`/wrapped/[usuario]/[año]`) y en
 * inglés (`/en/wrapped/[usuario]/[año]`). Ver lib/wrapped.ts.
 *
 * Antes del 1 de diciembre de cada año el 404 lo da `proxy.ts` (desde acá
 * saldría 200: ver el comentario de next.config.ts sobre el loading raíz); el
 * chequeo de abajo queda por las dudas. Sin ISR: se cachea 10 min en la CDN
 * (next.config.ts), así quien marca algo en diciembre lo ve enseguida.
 */

const SITIO = 'https://www.glynbox.com'
const TMDB_IMG = 'https://image.tmdb.org/t/p'

/** Violeta y rosa sobre el fondo oscuro de Glynbox. */
const VIOLETA = '#8B5CF6'
const ROSA = '#EC4899'
const FONDO = '#0A0A0F'

interface Params { usuario: string; anio: string }

function leerParams({ usuario, anio }: Params) {
  const n = anioDeRuta(anio)
  if (n == null || !wrappedAbierto(n)) notFound()
  return { usuario: decodeURIComponent(usuario), anio: n }
}

export async function metadataWrapped(params: Params, idioma: Idioma): Promise<Metadata> {
  const { usuario, anio } = leerParams(params)
  const carga = await cargarWrapped(usuario, anio, idioma)
  if (carga.estado === 'no-existe') return { robots: { index: false } }

  const t = textosWrapped(idioma)
  const nombre = carga.estado === 'ok'
    ? carga.vista.perfil.display_name || `@${carga.vista.perfil.username}`
    : carga.perfil.display_name || `@${carga.perfil.username}`
  const title = t.tituloPagina(nombre, anio)
  const url = `${SITIO}${rutaWrapped(idioma, usuario, anio)}`
  const alternates = {
    canonical: url,
    languages: {
      es: `${SITIO}${rutaWrapped('es', usuario, anio)}`,
      en: `${SITIO}${rutaWrapped('en', usuario, anio)}`,
    },
  }
  // Páginas personales: se comparten, no se indexan.
  const robots = { index: false, follow: true }

  if (carga.estado !== 'ok') return { title, alternates, robots }

  const { numero, numeroDice } = carga.vista
  const description = t.descripcion(numero, numeroDice, anio)
  const imagen = `${SITIO}${rutaImagenWrapped(idioma, usuario, anio)}`
  return {
    title,
    description,
    alternates,
    robots,
    openGraph: {
      title, description, url, type: 'website',
      images: [{ url: imagen, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [imagen] },
  }
}

export default async function Wrapped({ params, idioma }: { params: Params; idioma: Idioma }) {
  const { usuario, anio } = leerParams(params)
  const carga = await cargarWrapped(usuario, anio, idioma)
  if (carga.estado === 'no-existe') notFound()

  const t = textosWrapped(idioma)
  return (
    <main
      className="min-h-screen flex flex-col items-center px-4 py-6 sm:py-10 gap-5"
      style={{ background: FONDO }}
    >
      {carga.estado === 'ok'
        ? <Tarjeta vista={carga.vista} idioma={idioma} anio={anio} />
        : <SinWrapped usuario={carga.perfil.username} total={carga.total} anio={anio} idioma={idioma} />}

      <div className="w-full max-w-[420px] flex flex-col gap-3">
        {carga.estado === 'ok' && (
          <a
            href={rutaImagenWrapped(idioma, usuario, anio, 'historia')}
            download={`glynbox-wrapped-${anio}.jpg`}
            className="w-full rounded-full py-3 text-center text-sm font-semibold text-white border border-white/15 hover:bg-white/5 transition-colors"
          >
            {t.historia}
          </a>
        )}
        <BotonDescargarWrapped texto={t.descargar} />
        <Link
          href={`/usuario/${encodeURIComponent(usuario)}`}
          className="text-center text-sm text-white/50 hover:text-white/80 transition-colors py-1"
        >
          {t.verPerfil} @{usuario}
        </Link>
      </div>
    </main>
  )
}

/** Fondo del Wrapped: oscuro con manchas violeta y rosa. */
const fondoDegrade = [
  `radial-gradient(ellipse 90% 55% at 0% 0%, ${VIOLETA}66 0%, transparent 70%)`,
  `radial-gradient(ellipse 90% 55% at 100% 100%, ${ROSA}59 0%, transparent 70%)`,
  `linear-gradient(160deg, #1A1033 0%, ${FONDO} 45%, #22091A 100%)`,
].join(', ')

/**
 * La tarjeta 9:16. Las medidas van en `cqw` (ancho del contenedor), así se
 * ve igual en cualquier ancho y entra entera en la pantalla de un celular
 * para sacarle captura.
 */
function Tarjeta({ vista, idioma, anio }: { vista: WrappedVista; idioma: Idioma; anio: number }) {
  const t = textosWrapped(idioma)
  const { perfil, datos, numero, numeroDice, numeroExtra, tarjetas } = vista
  return (
    <div className="w-full max-w-[420px]" style={{ containerType: 'inline-size' }}>
      <section
        className="relative w-full overflow-hidden flex flex-col text-white"
        style={{
          aspectRatio: '9 / 16',
          borderRadius: '5cqw',
          background: fondoDegrade,
          padding: '7cqw 6cqw 6cqw',
          boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px -20px ${VIOLETA}80`,
        }}
      >
        {/* Logo y año */}
        <div className="flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Glynbox" style={{ height: '6cqw', width: 'auto' }} />
          <span
            className="font-bold tracking-wider"
            style={{
              fontSize: '3cqw', padding: '1.2cqw 3cqw', borderRadius: '99px',
              background: `linear-gradient(90deg, ${VIOLETA}, ${ROSA})`,
            }}
          >
            WRAPPED {anio}
          </span>
        </div>

        {/* Usuario */}
        <div className="flex items-center" style={{ gap: '2.5cqw', marginTop: '6cqw' }}>
          {perfil.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={perfil.avatar_url}
              alt=""
              className="rounded-full object-cover"
              style={{ width: '8cqw', height: '8cqw', border: '0.5cqw solid rgba(255,255,255,0.25)' }}
            />
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-semibold truncate" style={{ fontSize: '4cqw' }}>{t.titulo(anio)}</span>
            <span className="truncate" style={{ fontSize: '3.2cqw', color: 'rgba(255,255,255,0.6)' }}>@{perfil.username}</span>
          </div>
        </div>

        {/* Número grande */}
        <div className="flex flex-col" style={{ marginTop: '3cqw' }}>
          <span
            className="font-extrabold leading-none"
            style={{
              fontSize: numero >= 1000 ? '24cqw' : '30cqw',
              letterSpacing: '-0.04em',
              background: `linear-gradient(100deg, #FFFFFF 10%, #F5D0FE 50%, ${ROSA} 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {t.num(numero)}
          </span>
          <span className="font-bold" style={{ fontSize: '6.5cqw', marginTop: '1cqw' }}>{numeroDice}</span>
          {numeroExtra && (
            <span style={{ fontSize: '4cqw', color: 'rgba(255,255,255,0.65)' }}>{numeroExtra}</span>
          )}
        </div>

        {/* Tarjetas */}
        <div className="grid grid-cols-2" style={{ gap: '2.5cqw', marginTop: '5cqw' }}>
          {tarjetas.map(c => (
            <div
              key={c.clave}
              className="flex flex-col justify-between"
              style={{
                padding: '3cqw 3.5cqw', borderRadius: '3.5cqw', minHeight: '17cqw',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span style={{ fontSize: '2.9cqw', color: 'rgba(255,255,255,0.6)', lineHeight: 1.2 }}>{c.titulo}</span>
              <span className="font-extrabold truncate" style={{ fontSize: '5.6cqw', lineHeight: 1.15 }}>
                {c.valor}
                {c.clave === 'puntaje' && <span style={{ color: '#FFFD02' }}> ★</span>}
              </span>
            </div>
          ))}
        </div>

        {/* Favoritas */}
        {datos.favoritas.length > 0 && (
          <div className="flex flex-col" style={{ marginTop: '5cqw', gap: '2.5cqw' }}>
            <span className="font-semibold" style={{ fontSize: '3.4cqw', color: 'rgba(255,255,255,0.7)' }}>{t.favoritas}</span>
            <div className="grid grid-cols-4" style={{ gap: '2.5cqw' }}>
              {datos.favoritas.map(f => (
                <div
                  key={`${f.media_type}-${f.media_id}`}
                  className="overflow-hidden"
                  style={{ aspectRatio: '2 / 3', borderRadius: '2cqw', background: 'rgba(255,255,255,0.06)' }}
                >
                  {f.poster_path && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${TMDB_IMG}/w342${f.poster_path}`}
                      alt={f.titulo ?? ''}
                      title={f.titulo ?? undefined}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pie */}
        <div className="mt-auto flex items-end justify-between" style={{ paddingTop: '4cqw' }}>
          <span className="font-bold" style={{ fontSize: '3.8cqw' }}>glynbox.com</span>
          <span className="font-semibold" style={{ fontSize: '3.8cqw', color: '#F9A8D4' }}>{t.pie}</span>
        </div>
      </section>
    </div>
  )
}

/** Menos de 5 vistas en el año: no hay Wrapped. */
function SinWrapped({ usuario, total, anio, idioma }: { usuario: string; total: number; anio: number; idioma: Idioma }) {
  const t = textosWrapped(idioma)
  return (
    <section
      className="w-full max-w-[420px] rounded-3xl px-6 py-10 flex flex-col items-center text-center gap-5 text-white"
      style={{ background: fondoDegrade, border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Glynbox" style={{ height: 28, width: 'auto' }} />
      <div className="text-5xl" aria-hidden>🍿</div>
      <h1 className="text-2xl font-extrabold">{t.sinWrapped.titulo(anio)}</h1>
      <p className="text-white/75 leading-relaxed">{t.sinWrapped.texto(usuario, total, anio)}</p>
      <p className="text-white/75 leading-relaxed">{t.sinWrapped.invitacion}</p>
      <Link
        href="/"
        className="rounded-full px-6 py-3 font-semibold text-white"
        style={{ background: `linear-gradient(90deg, ${VIOLETA}, ${ROSA})` }}
      >
        {t.sinWrapped.boton}
      </Link>
    </section>
  )
}
