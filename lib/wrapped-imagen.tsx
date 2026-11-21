import type { Idioma } from './idioma'
import { SIZES } from './share-image'
import { textosWrapped, type WrappedVista } from './wrapped'

/**
 * Las imágenes del Wrapped (satori, ver lib/share-image.tsx): la historia
 * (1080 × 1920), igual a la tarjeta de la página, y la vista previa de los
 * links (1200 × 630), con lo mismo acomodado a lo ancho.
 *
 * Satori no es un navegador: todo div con más de un hijo lleva
 * `display: flex`, y las fuentes de las imágenes no tienen "★": la estrella
 * va dibujada.
 */

const VIOLETA = '#8B5CF6'
const ROSA = '#EC4899'
const FONDO = '#0A0A0F'
const TMDB_IMG = 'https://image.tmdb.org/t/p'

interface Props {
  vista: WrappedVista
  idioma: Idioma
  logo: string
  avatar: string | null
}

/** El fondo de la página, en capas (satori no junta bien varios degradés en uno). */
function Fondo({ width, height }: { width: number; height: number }) {
  const capa = { display: 'flex', position: 'absolute', left: 0, top: 0, width, height } as const
  return (
    <div style={capa}>
      <div style={{ ...capa, backgroundImage: `linear-gradient(160deg, #1A1033 0%, ${FONDO} 45%, #22091A 100%)` }} />
      <div style={{ ...capa, backgroundImage: `radial-gradient(circle at 0% 0%, ${VIOLETA}70 0%, transparent 55%)` }} />
      <div style={{ ...capa, backgroundImage: `radial-gradient(circle at 100% 100%, ${ROSA}60 0%, transparent 55%)` }} />
    </div>
  )
}

function Estrella({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ marginLeft: size * 0.25 }}>
      <path d="M12 1.8l3.09 6.26 6.91 1-5 4.87 1.18 6.88L12 17.56l-6.18 3.25L7 13.93l-5-4.87 6.91-1z" fill="#FFFD02" />
    </svg>
  )
}

function Pildora({ anio, size }: { anio: number; size: number }) {
  return (
    <div
      style={{
        display: 'flex', fontFamily: 'Inter Tight', fontWeight: 800, fontSize: size, color: '#fff',
        letterSpacing: size * 0.08, padding: `${size * 0.4}px ${size}px`, borderRadius: 999,
        backgroundImage: `linear-gradient(90deg, ${VIOLETA}, ${ROSA})`,
      }}
    >
      {`WRAPPED ${anio}`}
    </div>
  )
}

function NumeroGrande({ numero, size, idioma }: { numero: number; size: number; idioma: Idioma }) {
  return (
    <div
      style={{
        display: 'flex', fontFamily: 'Inter Tight', fontWeight: 800, fontSize: size, lineHeight: 1,
        letterSpacing: -size * 0.04, color: '#FFFFFF',
        backgroundImage: `linear-gradient(100deg, #FFFFFF 10%, #F5D0FE 50%, ${ROSA} 100%)`,
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}
    >
      {textosWrapped(idioma).num(numero)}
    </div>
  )
}

function Tarjetas({ vista, ancho, alto, gap, titulo, valor }: {
  vista: WrappedVista; ancho: number; alto: number; gap: number; titulo: number; valor: number
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap, width: ancho * 2 + gap }}>
      {vista.tarjetas.map(c => (
        <div
          key={c.clave}
          style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            width: ancho, height: alto, padding: `${titulo * 0.9}px ${titulo * 1.1}px`,
            borderRadius: titulo * 1.2, background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 600, fontSize: titulo, color: 'rgba(255,255,255,0.6)' }}>
            {c.titulo}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'Inter Tight', fontWeight: 800, fontSize: valor, color: '#fff' }}>
            {c.valor.length > 16 ? `${c.valor.slice(0, 15)}…` : c.valor}
            {c.clave === 'puntaje' && <Estrella size={valor * 0.8} />}
          </div>
        </div>
      ))}
    </div>
  )
}

function Posters({ vista, ancho, gap }: { vista: WrappedVista; ancho: number; gap: number }) {
  return (
    <div style={{ display: 'flex', gap }}>
      {vista.datos.favoritas.map(f => (
        <div
          key={`${f.media_type}-${f.media_id}`}
          style={{
            display: 'flex', width: ancho, height: ancho * 1.5, borderRadius: ancho * 0.08,
            overflow: 'hidden', background: 'rgba(255,255,255,0.06)',
          }}
        >
          {f.poster_path && (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={`${TMDB_IMG}/w342${f.poster_path}`} width={ancho} height={ancho * 1.5} style={{ objectFit: 'cover' }} />
          )}
        </div>
      ))}
    </div>
  )
}

function Usuario({ vista, idioma, avatar, size }: { vista: WrappedVista; idioma: Idioma; avatar: string | null; size: number }) {
  const t = textosWrapped(idioma)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.6 }}>
      {avatar && (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img src={avatar} width={size * 2} height={size * 2} style={{ borderRadius: 999, border: `${size * 0.12}px solid rgba(255,255,255,0.25)` }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 700, fontSize: size, color: '#fff' }}>
          {t.titulo(vista.datos.anio)}
        </div>
        <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 500, fontSize: size * 0.8, color: 'rgba(255,255,255,0.6)' }}>
          {`@${vista.perfil.username}`}
        </div>
      </div>
    </div>
  )
}

/** La historia: la tarjeta de la página a 1080 de ancho (1 cqw = 10,8 px). */
export function WrappedHistoria({ vista, idioma, logo, avatar }: Props) {
  const { width, height } = SIZES.historia
  const u = (cqw: number) => Math.round(cqw * 10.8)
  const t = textosWrapped(idioma)
  return (
    <div style={{ display: 'flex', width, height, position: 'relative', background: FONDO }}>
      <Fondo width={width} height={height} />
      <div style={{ display: 'flex', flexDirection: 'column', width, height, padding: `${u(7)}px ${u(6)}px ${u(6)}px`, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logo} height={u(6)} width={Math.round(u(6) * 2098 / 437)} />
          <Pildora anio={vista.datos.anio} size={u(3)} />
        </div>
        <div style={{ display: 'flex', marginTop: u(6) }}>
          <Usuario vista={vista} idioma={idioma} avatar={avatar} size={u(4)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: u(3) }}>
          <NumeroGrande numero={vista.numero} size={vista.numero >= 1000 ? u(24) : u(30)} idioma={idioma} />
          <div style={{ display: 'flex', fontFamily: 'Inter Tight', fontWeight: 700, fontSize: u(6.5), color: '#fff', marginTop: u(1) }}>
            {vista.numeroDice}
          </div>
          {vista.numeroExtra && (
            <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 500, fontSize: u(4), color: 'rgba(255,255,255,0.65)' }}>
              {vista.numeroExtra}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', marginTop: u(5) }}>
          <Tarjetas vista={vista} ancho={(width - 2 * u(6) - u(2.5)) / 2} alto={u(17)} gap={u(2.5)} titulo={u(2.9)} valor={u(5.6)} />
        </div>
        {vista.datos.favoritas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: u(5), gap: u(2.5) }}>
            <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 600, fontSize: u(3.4), color: 'rgba(255,255,255,0.7)' }}>
              {t.favoritas}
            </div>
            <Posters vista={vista} ancho={(width - 2 * u(6) - 3 * u(2.5)) / 4} gap={u(2.5)} />
          </div>
        )}
        <div style={{ display: 'flex', flexGrow: 1, minHeight: u(4) }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', fontFamily: 'Inter Tight', fontWeight: 700, fontSize: u(3.8), color: '#fff' }}>glynbox.com</div>
          <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 700, fontSize: u(3.8), color: '#F9A8D4' }}>{t.pie}</div>
        </div>
      </div>
    </div>
  )
}

/** La vista previa de los links: número a la izquierda, tarjetas y pósters a la derecha. */
export function WrappedLink({ vista, idioma, logo, avatar }: Props) {
  const { width, height } = SIZES.link
  const t = textosWrapped(idioma)
  const pad = 52
  return (
    <div style={{ display: 'flex', width, height, position: 'relative', background: FONDO }}>
      <Fondo width={width} height={height} />
      <div style={{ display: 'flex', width, height, padding: pad, gap: 44, position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 470 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={logo} height={44} width={Math.round(44 * 2098 / 437)} />
            <Pildora anio={vista.datos.anio} size={18} />
          </div>
          <div style={{ display: 'flex', marginTop: 34 }}>
            <Usuario vista={vista} idioma={idioma} avatar={avatar} size={26} />
          </div>
          <div style={{ display: 'flex', marginTop: 14 }}>
            <NumeroGrande numero={vista.numero} size={vista.numero >= 1000 ? 150 : 190} idioma={idioma} />
          </div>
          <div style={{ display: 'flex', fontFamily: 'Inter Tight', fontWeight: 700, fontSize: 40, color: '#fff' }}>
            {vista.numeroDice}
          </div>
          {vista.numeroExtra && (
            <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 500, fontSize: 26, color: 'rgba(255,255,255,0.65)' }}>
              {vista.numeroExtra}
            </div>
          )}
          <div style={{ display: 'flex', flexGrow: 1 }} />
          <div style={{ display: 'flex', gap: 18, fontSize: 24 }}>
            <div style={{ display: 'flex', fontFamily: 'Inter Tight', fontWeight: 700, color: '#fff' }}>glynbox.com</div>
            <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 700, color: '#F9A8D4' }}>{t.pie}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, flexGrow: 1 }}>
          <Tarjetas vista={vista} ancho={279} alto={96} gap={14} titulo={18} valor={32} />
          {vista.datos.favoritas.length > 0 && (
            <Posters vista={vista} ancho={130} gap={13} />
          )}
        </div>
      </div>
    </div>
  )
}
