import Link from 'next/link'
import GuiaTarjeta from '@/components/GuiaTarjeta'
import { getPosterUrl } from '@/lib/tmdb'
import type { GuideFrontmatter } from '@/lib/guides'
import type { RecomendacionPortada, ResenaPortada } from '@/lib/portada-contenido'

/**
 * El contenido propio de la portada pública, debajo del encabezado: cómo
 * funciona Glynbox, lo último que recomendó Fer Lage, reseñas de la comunidad
 * y las guías. Server Component: todo sale escrito en el HTML. Ver
 * `lib/portada-contenido.ts`.
 */

function Estrellas({ nota }: { nota: number }) {
  const llenas = Math.floor(nota)
  const media = nota - llenas >= 0.5
  return (
    <span className="text-[13px] tracking-tight text-[#FFFD02]" aria-label={`${nota} de 5 estrellas`}>
      {'★'.repeat(llenas)}{media ? '½' : ''}
      <span className="text-zinc-700">{'★'.repeat(5 - llenas - (media ? 1 : 0))}</span>
    </span>
  )
}

function Encabezado({ id, titulo, bajada, href, link }: { id: string; titulo: string; bajada: string; href?: string; link?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 id={id} className="text-xl font-bold text-white sm:text-2xl">{titulo}</h2>
        <p className="mt-1 text-sm text-zinc-400">{bajada}</p>
      </div>
      {href && link && (
        <Link href={href} prefetch={false} className="shrink-0 text-xs font-semibold text-[#FFFD02] hover:text-[#FFF84D]">
          {link}
        </Link>
      )}
    </div>
  )
}

const PASOS = [
  {
    titulo: 'Elegí tus plataformas',
    texto: 'Marcás qué servicios tenés y Glynbox te muestra sólo lo que podés ver hoy en tu país, sin buscar título por título.',
  },
  {
    titulo: 'Calificá lo que viste',
    texto: 'Cada estrella y cada reseña afina tus recomendaciones. Tus listas, tu historial y lo que querés ver quedan en un solo lugar.',
  },
  {
    titulo: 'Seguí a gente con tu gusto',
    texto: 'Leé reseñas de otros cinéfilos, compartí listas y recibí las recomendaciones en video de Fer Lage.',
  },
]

export default function PortadaContenido({
  resenas,
  recomendaciones,
  guias,
}: {
  resenas: ResenaPortada[]
  recomendaciones: RecomendacionPortada[]
  guias: GuideFrontmatter[]
}) {
  return (
    <div className="relative z-10 mx-auto w-full max-w-5xl space-y-14 px-4 pb-6 pt-12 sm:px-6">
      <section aria-labelledby="como-funciona">
        <h2 id="como-funciona" className="mb-5 text-xl font-bold text-white sm:text-2xl">Cómo funciona Glynbox</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {PASOS.map((p, i) => (
            <li key={p.titulo} className="rounded-xl border border-[#2A2A3A] bg-[#13131A] p-5">
              <p className="text-xs font-bold text-[#FFFD02]">{i + 1}</p>
              <h3 className="mt-1 font-semibold text-white">{p.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      {recomendaciones.length > 0 && (
        <section aria-labelledby="recomendaciones-fer">
          <Encabezado
            id="recomendaciones-fer"
            titulo="Lo último que recomendó Fer Lage"
            bajada="Películas y series que Fer reseña en video en Instagram (@ferlageok). En cada ficha está su video."
          />
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
            {recomendaciones.map(r => (
              <li key={r.instagramCode} className="w-28 shrink-0 sm:w-auto">
                <Link href={`/${r.mediaType}/${r.mediaId}`} prefetch={false} className="group block">
                  <div className="aspect-[2/3] overflow-hidden rounded-lg bg-[#1C1C27] ring-1 ring-white/10">
                    {r.posterPath && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getPosterUrl(r.posterPath, 'w185')}
                        alt={r.titulo}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs font-medium leading-snug text-zinc-200 group-hover:text-white">{r.titulo}</p>
                  {r.anio && <p className="text-[11px] text-zinc-500">{r.anio}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {resenas.length > 0 && (
        <section aria-labelledby="resenas-comunidad">
          <Encabezado
            id="resenas-comunidad"
            titulo="Reseñas de la comunidad"
            bajada="Lo que escriben quienes usan Glynbox sobre lo que acaban de ver."
            href="/comunidad"
            link="Ver más →"
          />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resenas.map(r => (
              <li key={r.id} className="flex gap-3 rounded-xl border border-[#2A2A3A] bg-[#13131A] p-4">
                <Link href={`/${r.mediaType}/${r.mediaId}`} prefetch={false} className="w-14 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getPosterUrl(r.posterPath, 'w92')}
                    alt={r.titulo}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[2/3] w-14 rounded-md object-cover ring-1 ring-white/10"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/${r.mediaType}/${r.mediaId}`} prefetch={false} className="line-clamp-1 text-sm font-semibold text-white hover:text-[#FFFD02]">
                    {r.titulo}
                  </Link>
                  {r.nota != null && r.nota > 0 && <Estrellas nota={r.nota} />}
                  <blockquote className="mt-1.5 line-clamp-4 text-sm leading-relaxed text-zinc-300">{r.texto}</blockquote>
                  <p className="mt-2 text-xs text-zinc-500">
                    <Link href={`/usuario/${r.username}`} prefetch={false} className="hover:text-white">{r.autor}</Link>
                    {' · '}
                    <Link href={`/review/${r.id}`} prefetch={false} className="hover:text-white">Ver reseña</Link>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {guias.length > 0 && (
        <section aria-labelledby="guias-portada">
          <Encabezado
            id="guias-portada"
            titulo="Guías de cine y series"
            bajada="Recorridos escritos por Fer Lage: por dónde empezar, en qué orden y qué no perderse."
            href="/guias"
            link="Ver todas →"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {guias.map(g => <GuiaTarjeta key={g.slug} guia={g} />)}
          </div>
        </section>
      )}
    </div>
  )
}
