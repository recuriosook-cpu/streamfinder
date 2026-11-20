'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Download, Film, RotateCcw, Share2, Volume2, VolumeX, X } from 'lucide-react'
import s from './ruleta.module.css'
import { activarAudio, premio, tic } from './sonidos'
import { abrirFichaEnApp } from './abrir-ficha'

export interface PeliculaRuleta {
  id: number
  titulo: string
  poster: string | null
  /** Puesto en el Top 250, desde 1. */
  puesto: number
}

const URL_COMPARTIR = 'https://www.glynbox.com/ruleta'
const LISTA_URL = '/listas/be143bb8-18e8-4982-8ceb-982ecb7cc39a'
// `src` es la marca de campaña que lee `/descargar` y viaja a las tiendas.
const DESCARGAR_URL = '/descargar?src=ruleta'

// ── Lo que ya salió, en el navegador ─────────────────────────────────────────
// Con useSyncExternalStore y no con un efecto: el primer HTML sale sin nada
// guardado (el servidor no ve el localStorage) y después se sincroniza solo.

const CLAVE_SALIDAS = 'glynbox-ruleta-salidas'
const CLAVE_NO_REPETIR = 'glynbox-ruleta-no-repetir'
const CLAVE_SILENCIO = 'glynbox-ruleta-silencio'
const oyentes = new Set<() => void>()

function leer(clave: string): string | null {
  try { return localStorage.getItem(clave) } catch { return null }
}
function escribir(clave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(clave)
    else localStorage.setItem(clave, valor)
  } catch { /* modo privado o sin espacio: queda sólo en memoria hasta recargar */ }
  oyentes.forEach(o => o())
}
function suscribir(o: () => void) {
  oyentes.add(o)
  window.addEventListener('storage', o)
  return () => { oyentes.delete(o); window.removeEventListener('storage', o) }
}
function useGuardado(clave: string) {
  return useSyncExternalStore(suscribir, () => leer(clave), () => null)
}

// ── Geometría de la rueda ────────────────────────────────────────────────────
// Ángulos en grados, en sentido horario desde arriba (donde está el puntero).

const R_GAJOS = 180
const R_CENTRO = 64

function punto(grados: number, r: number) {
  const a = (grados * Math.PI) / 180
  return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`
}
function gajo(desde: number, hasta: number) {
  return `M${punto(desde, R_CENTRO)}L${punto(desde, R_GAJOS)}A${R_GAJOS} ${R_GAJOS} 0 0 1 ${punto(hasta, R_GAJOS)}`
    + `L${punto(hasta, R_CENTRO)}A${R_CENTRO} ${R_CENTRO} 0 0 0 ${punto(desde, R_CENTRO)}Z`
}

const DURACION = 3800
const DURACION_REDUCIDA = 1200
const LAMPARAS = 40
/** Entre dos tics, como mínimo: a toda velocidad pasan cientos de gajos por segundo. */
const TIC_MINIMO_MS = 28

const poster = (p: string | null, tam = 'w500') => (p ? `https://image.tmdb.org/t/p/${tam}${p}` : '/no-poster.svg')

export default function RuletaClient({ peliculas }: { peliculas: PeliculaRuleta[] }) {
  const total = peliculas.length
  const paso = total ? 360 / total : 0

  const [rotacion, setRotacion] = useState(0)
  const [duracion, setDuracion] = useState(DURACION)
  const [girando, setGirando] = useState(false)
  const [ganador, setGanador] = useState<number | null>(null)
  const [resultado, setResultado] = useState<number | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // ── Sonido ──
  const silencio = useGuardado(CLAVE_SILENCIO) === '1'
  const silencioRef = useRef(silencio)
  useEffect(() => { silencioRef.current = silencio }, [silencio])
  const rueda = useRef<SVGSVGElement>(null)

  // El audio arranca con el primer toque en cualquier lado de la página.
  useEffect(() => {
    const activar = () => activarAudio()
    window.addEventListener('pointerdown', activar, { once: true })
    window.addEventListener('touchend', activar, { once: true })
    return () => { window.removeEventListener('pointerdown', activar); window.removeEventListener('touchend', activar) }
  }, [])

  // Un tic cada vez que un gajo pasa por el puntero. Se lee el ángulo real de
  // la rueda en cada cuadro (la transición la mueve CSS), así que los tics se
  // espacian solos a medida que frena.
  useEffect(() => {
    if (!girando || silencio || !paso) return
    let cuadro = 0
    let anterior = -1
    let ultimoTic = 0
    const mirar = (ahora: number) => {
      const el = rueda.current
      if (el) {
        const m = getComputedStyle(el).transform.match(/matrix\(([^,]+),\s*([^,]+)/)
        if (m) {
          const grados = (Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI
          const gajoArriba = Math.floor(((((-grados) % 360) + 360) % 360) / paso)
          if (anterior !== -1 && gajoArriba !== anterior && ahora - ultimoTic >= TIC_MINIMO_MS) {
            tic()
            ultimoTic = ahora
          }
          anterior = gajoArriba
        }
      }
      cuadro = requestAnimationFrame(mirar)
    }
    cuadro = requestAnimationFrame(mirar)
    return () => cancelAnimationFrame(cuadro)
  }, [girando, silencio, paso])

  const salidasRaw = useGuardado(CLAVE_SALIDAS)
  const noRepetir = useGuardado(CLAVE_NO_REPETIR) === '1'
  const salidas = useMemo(() => {
    try {
      const v = JSON.parse(salidasRaw ?? '[]')
      return new Set<number>(Array.isArray(v) ? v.filter(n => typeof n === 'number') : [])
    } catch { return new Set<number>() }
  }, [salidasRaw])
  const cuantasSalieron = peliculas.filter(p => salidas.has(p.id)).length
  const disponibles = noRepetir ? peliculas.filter(p => !salidas.has(p.id)) : peliculas
  const agotadas = total > 0 && disponibles.length === 0

  // Los gajos se calculan una vez: son 250 paths y no cambian.
  const caminos = useMemo(() => peliculas.map((_, i) => gajo(i * paso, (i + 1) * paso)), [peliculas, paso])

  function girar() {
    if (girando || !disponibles.length) return
    activarAudio()
    setResultado(null)
    setGanador(null)

    const elegida = disponibles[Math.floor(Math.random() * disponibles.length)]
    const i = elegida.puesto - 1
    // Que el póster ya esté bajado cuando frene la rueda.
    if (elegida.poster) { const img = new Image(); img.src = poster(elegida.poster) }

    // El centro del gajo tiene que quedar arriba: la rueda gira hasta que
    // (centro + rotación) sea múltiplo de 360. Un poco de azar dentro del gajo
    // para que no frene siempre en el medio exacto.
    const centro = (i + 0.5) * paso + (Math.random() - 0.5) * paso * 0.6
    const actual = ((rotacion % 360) + 360) % 360
    const falta = (((-centro - actual) % 360) + 360) % 360
    const vueltas = 5 + Math.floor(Math.random() * 2)
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const dur = reducido ? DURACION_REDUCIDA : DURACION

    setDuracion(dur)
    setRotacion(rotacion + vueltas * 360 + falta)
    setGirando(true)

    timers.current.push(setTimeout(() => {
      setGirando(false)
      setGanador(i)
      const nuevas = new Set(salidas)
      nuevas.add(elegida.id)
      escribir(CLAVE_SALIDAS, JSON.stringify([...nuevas]))
      timers.current.push(setTimeout(() => {
        setResultado(i)
        if (!silencioRef.current) premio()
      }, reducido ? 150 : 650))
    }, dur + 80))
  }

  function reiniciar() {
    escribir(CLAVE_SALIDAS, null)
    setGanador(null)
    toast.success('Listo: pueden volver a salir las 250')
  }

  const peli = resultado !== null ? peliculas[resultado] : null

  return (
    <div className={`${s.fondo} min-h-[100dvh] overflow-x-clip flex flex-col items-center px-4 pt-5 pb-8`}>
      <header className="relative w-full max-w-md flex flex-col items-center text-center">
        <button type="button" onClick={() => escribir(CLAVE_SILENCIO, silencio ? null : '1')}
          aria-label={silencio ? 'Activar el sonido' : 'Silenciar'} aria-pressed={silencio}
          className="absolute right-0 top-0 w-9 h-9 -mt-1 flex items-center justify-center rounded-full text-[#A0A0B0] hover:text-white hover:bg-white/10">
          {silencio ? <VolumeX size={19} /> : <Volume2 size={19} />}
        </button>
        <Link href="/" aria-label="Glynbox, ir al inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Glynbox" width={2098} height={437} className="h-7 w-auto" />
        </Link>
        <h1 className={`${s.titulo} mt-5 text-[2rem] leading-tight font-bold tracking-tight`}>La Ruleta de Glynbox</h1>
        <p className="mt-1.5 text-sm text-[#A0A0B0]">
          Girá y descubrí cuál de las <span className="text-white font-medium">250 mejores películas</span> te toca ver hoy
        </p>
      </header>

      {total === 0 ? (
        <p className="mt-16 text-center text-[#A0A0B0]">No pudimos cargar la ruleta. Probá de nuevo en un rato.</p>
      ) : (
        <>
          <div
            className={`relative mt-6 ${girando ? s.girando : ''}`}
            style={{ width: 'min(92vw, 56dvh, 520px)', aspectRatio: '1' }}
          >
            {/* Recortada en un círculo: al girar, el cuadrado del SVG ocupa su diagonal y ensanchaba la página. */}
            <div className="absolute inset-0 rounded-full overflow-hidden">
            <svg ref={rueda} viewBox="-200 -200 400 400" className={`${s.rueda} absolute inset-0 w-full h-full`}
              style={{ transform: `rotate(${rotacion}deg)`, transition: girando ? `transform ${duracion}ms cubic-bezier(0.12, 0.75, 0.15, 1)` : 'none' }}
              role="img" aria-label={`Ruleta con las ${total} mejores películas`}>
              <defs>
                <linearGradient id="ruleta-aro" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#FFF3C4" />
                  <stop offset="0.3" stopColor="#D4A537" />
                  <stop offset="0.55" stopColor="#8A6A1F" />
                  <stop offset="0.8" stopColor="#E9C46A" />
                  <stop offset="1" stopColor="#7A5A1A" />
                </linearGradient>
                <radialGradient id="ruleta-oro" cx="0" cy="0" r={R_GAJOS} gradientUnits="userSpaceOnUse">
                  <stop offset="0.35" stopColor="#8A6A1F" />
                  <stop offset="0.75" stopColor="#D4A537" />
                  <stop offset="1" stopColor="#F7DC8A" />
                </radialGradient>
                <radialGradient id="ruleta-negro" cx="0" cy="0" r={R_GAJOS} gradientUnits="userSpaceOnUse">
                  <stop offset="0.35" stopColor="#0B0906" />
                  <stop offset="1" stopColor="#2A2010" />
                </radialGradient>
                <radialGradient id="ruleta-centro" cx="-0.3" cy="-0.3" r="1.2">
                  <stop offset="0" stopColor="#2A2010" />
                  <stop offset="1" stopColor="#0B0906" />
                </radialGradient>
              </defs>

              {/* Aro exterior con lamparitas. */}
              <circle r="199" fill="url(#ruleta-aro)" />
              <circle r="186" fill="#0B0906" />
              {Array.from({ length: LAMPARAS }, (_, k) => {
                const [x, y] = punto((k * 360) / LAMPARAS, 192.5).split(' ')
                return <circle key={k} cx={x} cy={y} r="2.6" className={`${s.lampara} ${k % 2 ? s.lamparaImpar : s.lamparaPar}`} />
              })}

              {/* Los 250 gajos. */}
              {caminos.map((d, i) => {
                const p = peliculas[i]
                const fuera = noRepetir && salidas.has(p.id)
                const fill = ganador === i ? '#FFFD02'
                  : fuera ? (i % 2 ? '#1A1A22' : '#2A2A34')
                  : i % 2 ? 'url(#ruleta-negro)' : 'url(#ruleta-oro)'
                return <path key={p.id} d={d} fill={fill} />
              })}

              {/* Números cada 10, a lo largo del gajo. */}
              {peliculas.map((p, i) => (p.puesto === 1 || p.puesto % 10 === 0) && (
                <text key={p.id} transform={`rotate(${(i + 0.5) * paso}) translate(0 -168) rotate(90)`}
                  textAnchor="middle" dominantBaseline="central" fontSize="7.5" fontWeight="700"
                  fill={ganador === i ? '#0A0A0F' : '#FFF6D5'} stroke="#0B0906" strokeWidth="0.35"
                  style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
                  {p.puesto}
                </text>
              ))}

              <circle r={R_GAJOS + 0.5} fill="none" stroke="#F2C94C" strokeWidth="1.2" />
              <circle r={R_CENTRO} fill="url(#ruleta-aro)" />
              <circle r={R_CENTRO - 5} fill="url(#ruleta-centro)" />
            </svg>
            </div>

            {/* Puntero, fijo arriba. */}
            <svg viewBox="0 0 40 52" className="absolute left-1/2 -translate-x-1/2 -top-[3%] w-[9%] drop-shadow-[0_4px_6px_rgba(0,0,0,0.7)]" aria-hidden="true">
              <g className={s.puntero}>
                <path d="M20 50 L4 16 A16 16 0 1 1 36 16 Z" fill="url(#ruleta-puntero)" stroke="#0B0906" strokeWidth="2" />
                <circle cx="20" cy="16" r="6" fill="#0B0906" />
                <circle cx="20" cy="16" r="3" fill="#FFFD02" />
              </g>
              <defs>
                <linearGradient id="ruleta-puntero" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#FFF3C4" />
                  <stop offset="0.5" stopColor="#D4A537" />
                  <stop offset="1" stopColor="#7A5A1A" />
                </linearGradient>
              </defs>
            </svg>

            <button
              type="button"
              onClick={girar}
              disabled={girando || agotadas}
              className={`${s.boton} ${!girando ? s.listo : ''} absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[27%] aspect-square rounded-full
                flex items-center justify-center text-[#0A0A0F] font-extrabold tracking-wider text-[clamp(0.95rem,4.6vw,1.45rem)]
                transition-[scale] disabled:cursor-default disabled:saturate-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FFFD02]`}
            >
              GIRAR
            </button>
          </div>

          <p className="sr-only" aria-live="polite">
            {peli ? `Salió el puesto ${peli.puesto}: ${peli.titulo}` : girando ? 'Girando…' : ''}
          </p>

          <div className="mt-8 w-full max-w-sm flex flex-col items-center gap-3">
            {agotadas && (
              <p className="text-center text-sm text-[#F2C94C]">Ya salieron las {total}. Reiniciá para volver a girar.</p>
            )}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={noRepetir}
                onChange={e => escribir(CLAVE_NO_REPETIR, e.target.checked ? '1' : null)}
                className="peer sr-only"
              />
              <span className="relative w-11 h-6 rounded-full bg-[#2A2A3A] peer-checked:bg-[#D4A537] transition-colors
                after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform
                peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#FFFD02]" />
              <span className="text-sm text-white">No repetir las que ya salieron</span>
            </label>
            <div className="flex items-center gap-2 text-xs text-[#A0A0B0]">
              <span>Salieron {cuantasSalieron} de {total}</span>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={reiniciar} disabled={cuantasSalieron === 0 || girando}
                className="inline-flex items-center gap-1 text-[#F2C94C] hover:text-[#FFFD02] disabled:text-[#5A5A6A] disabled:cursor-default">
                <RotateCcw size={12} /> Reiniciar
              </button>
            </div>
            <Link href={LISTA_URL} prefetch={false} className="mt-2 text-xs text-[#A0A0B0] underline underline-offset-2 hover:text-white">
              Ver las 250 películas
            </Link>
          </div>
        </>
      )}

      <footer className="mt-auto pt-10 text-center text-sm text-[#A0A0B0]">
        ¿Querés más recomendaciones como esta?{' '}
        <Link href={DESCARGAR_URL} prefetch={false} className="font-semibold text-[#F2C94C] hover:text-[#FFFD02] underline underline-offset-2">
          Descargá Glynbox
        </Link>
      </footer>

      {peli && (
        <Resultado
          peli={peli}
          total={total}
          onCerrar={() => setResultado(null)}
          onGirar={() => { setResultado(null); girar() }}
          puedeGirar={!agotadas}
        />
      )}
    </div>
  )
}

function Resultado({ peli, total, onCerrar, onGirar, puedeGirar }: {
  peli: PeliculaRuleta; total: number; onCerrar: () => void; onGirar: () => void; puedeGirar: boolean
}) {
  const verFicha = useRef<HTMLAnchorElement>(null)
  // En una ref para que el efecto corra una sola vez al abrir y no le robe el
  // foco a nadie en cada render.
  const cerrar = useRef(onCerrar)
  useEffect(() => { cerrar.current = onCerrar })
  useEffect(() => {
    verFicha.current?.focus({ preventScroll: true })
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar.current() }
    window.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = overflow }
  }, [])

  async function compartir() {
    const texto = `Me salió "${peli.titulo}" (puesto ${peli.puesto} del Top ${total}) en La Ruleta de Glynbox. ¿Qué te toca a vos?`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'La Ruleta de Glynbox', text: texto, url: URL_COMPARTIR })
        return
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(URL_COMPARTIR)
      toast.success('Link copiado')
    } catch {
      toast.error('No se pudo copiar el link')
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ruleta-resultado-titulo"
      className={`${s.resultado} ${s.fondo} fixed inset-0 z-[60] overflow-y-auto`}>
      <div className="min-h-full flex flex-col items-center px-5 pt-5 pb-8">
        <div className="w-full max-w-md flex items-center justify-between">
          <span className="w-9" />
          <Link href="/" aria-label="Glynbox, ir al inicio">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Glynbox" width={2098} height={437} className="h-7 w-auto" />
          </Link>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"
            className="w-9 h-9 flex items-center justify-center rounded-full text-[#A0A0B0] hover:text-white hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <p className={`${s.numero} mt-3 text-[clamp(4.5rem,24vw,7rem)] leading-none font-black tracking-tight`}
          style={{ fontFamily: "'Inter Tight', Inter, sans-serif" }}>
          #{peli.puesto}
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster(peli.poster)}
          alt={`Póster de ${peli.titulo}`}
          width={500}
          height={750}
          className={`${s.resultadoPoster} mt-4 w-auto h-[min(46dvh,30rem)] max-w-[80vw] aspect-[2/3] object-cover rounded-xl
            ring-2 ring-[#D4A537] shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_40px_rgba(212,165,55,0.25)]`}
        />

        <h2 id="ruleta-resultado-titulo" className="mt-5 max-w-md text-center text-2xl font-bold leading-tight text-white">
          {peli.titulo}
        </h2>
        <p className="mt-1.5 text-sm text-[#F2C94C]">Puesto {peli.puesto} del Top {total} de Glynbox</p>

        <div className="mt-6 w-full max-w-sm flex flex-col gap-2.5">
          <Link ref={verFicha} href={`/movie/${peli.id}`} prefetch={false}
            onClick={e => { if (abrirFichaEnApp(peli.id)) e.preventDefault() }}
            className="h-12 rounded-full bg-[#FFFD02] text-[#0A0A0F] font-semibold flex items-center justify-center gap-2 hover:brightness-95">
            <Film size={18} /> Ver ficha
          </Link>
          <Link href={DESCARGAR_URL} prefetch={false}
            className="h-12 rounded-full border border-[#FFFD02]/60 text-[#FFFD02] font-medium flex items-center justify-center gap-2 hover:bg-[#FFFD02]/10">
            <Download size={17} /> Descargar la app
          </Link>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={compartir}
              className="h-12 rounded-full border border-[#2A2A3A] bg-[#13131A] text-white font-medium flex items-center justify-center gap-2 hover:bg-[#1C1C27]">
              <Share2 size={17} /> Compartir
            </button>
            <button type="button" onClick={onGirar} disabled={!puedeGirar}
              className="h-12 rounded-full border border-[#D4A537] text-[#F2C94C] font-medium flex items-center justify-center gap-2 hover:bg-[#D4A537]/10 disabled:opacity-40">
              <RotateCcw size={17} /> Girar de nuevo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
