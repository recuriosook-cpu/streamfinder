import { getPosterUrl } from '@/lib/tmdb'

/**
 * La cartelera en movimiento de `/descargar`.
 *
 * Ocupa el aire que quedaba entre el logo y el título: tres filas de posters
 * apenas inclinadas que se desplazan despacio, cada una para el lado contrario
 * que la de arriba. La idea es que la pantalla se lea como un cine y no como un
 * formulario, sin robarle protagonismo al título — por eso los bordes se
 * disuelven en el negro del fondo en vez de cortarse.
 *
 * ── Qué hace este archivo y qué hace el CSS ────────────────────────────────
 *
 * Acá sólo está el árbol: la banda, las filas y las imágenes. Toda la
 * apariencia y el movimiento viven en `app/globals.css`, bajo "Mosaico de
 * posters". No es una separación por gusto: las velocidades distintas de cada
 * fila y las direcciones alternadas se resuelven con `:nth-child`, que en CSS
 * son tres renglones y acá adentro serían estilos en línea calculados por
 * índice.
 *
 * ── Por qué las tiras repiten la lista ─────────────────────────────────────
 *
 * Una tira se anima de `translateX(0)` a `translateX(-50%)` y vuelve a empezar.
 * Con la lista repetida exactamente dos veces, ese `-50%` cae justo sobre el
 * comienzo de la copia, así que el salto del reinicio es invisible y la fila
 * parece infinita. Son el doble de etiquetas `<img>` pero las mismas URLs, o
 * sea ninguna descarga de más.
 *
 * Por eso mismo la separación entre posters es un `margin-right` y no un `gap`
 * de flex: con `gap`, la mitad del ancho total no coincide con el comienzo de
 * la segunda copia —queda medio espacio de diferencia— y cada vuelta pega un
 * tironcito. Con el margen adentro de cada ítem la cuenta cierra exacta.
 *
 * ── Accesibilidad ──────────────────────────────────────────────────────────
 *
 * Es decoración: `aria-hidden` en la banda, `alt=""` en cada imagen y
 * `pointer-events-none` para no robarle ningún toque al botón. A quien pidió
 * menos movimiento se le muestran los posters quietos; eso está en el CSS.
 */

/** Cuántas filas tiene la cartelera. */
const FILAS = 3

/**
 * Mínimo de posters para que valga la pena dibujar algo.
 *
 * Con menos de cuatro por fila la tira es tan corta que el bucle se nota, y en
 * pantallas anchas se ve el mismo poster tres veces en un renglón. Si TMDB
 * devolvió tan poco, mejor la pantalla sin mosaico: es exactamente la que había
 * antes y nadie la va a extrañar.
 */
const MINIMO_POSTERS = FILAS * 4

/**
 * Reparte las rutas en filas parejas, en orden.
 *
 * En orden y no salteado porque la lista que llega ya viene intercalando
 * películas y series (ver `posters.ts`), así que cualquier tajada consecutiva
 * sale mezclada sola.
 */
function repartirEnFilas(posters: string[], filas: number): string[][] {
  const porFila = Math.floor(posters.length / filas)

  return Array.from({ length: filas }, (_, i) =>
    posters.slice(i * porFila, (i + 1) * porFila),
  )
}

export function MosaicoPosters({ posters }: { posters: string[] }) {
  // Sin material suficiente no hay banda. Devolver `null` y no un hueco vacío
  // importa: la banda es un `flex-1` y un contenedor vacío se quedaría igual
  // con su porción de la pantalla, empujando el botón hacia abajo a cambio de
  // nada.
  if (posters.length < MINIMO_POSTERS) return null

  const filas = repartirEnFilas(posters, FILAS)

  return (
    <div
      aria-hidden="true"
      className="mosaico relative z-10 max-h-[34svh] w-full min-h-0 flex-1 select-none overflow-hidden"
    >
      {/*
        La capa inclinada va en posición absoluta para que su alto no participe
        de la cuenta del flex de afuera: las filas miden bastante más que la
        banda en cualquier teléfono, y si empujaran el layout se llevarían
        puesto el botón. Acá adentro sobran por arriba y por abajo, y el recorte
        de la banda —más el degradé— es justamente el efecto que se busca.
      */}
      <div className="mosaico-inclinado pointer-events-none">
        {filas.map((fila, i) => (
          <div key={i} className="mosaico-fila">
            <div className="mosaico-tira">
              {[...fila, ...fila].map((ruta, j) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={`${ruta}-${j}`}
                  src={getPosterUrl(ruta, 'w185')}
                  alt=""
                  width={185}
                  height={278}
                  /*
                    `low` a propósito: son decoración y no pueden competir por
                    el ancho de banda con el logo ni retrasar la pintura del
                    botón, que es lo único que esta pantalla tiene que hacer
                    rápido. Sin `loading="lazy"`: están a la vista desde el
                    primer momento, así que diferirlas sólo lograría que
                    aparecieran de a pedazos.
                  */
                  fetchPriority="low"
                  decoding="async"
                  draggable={false}
                  className="mosaico-poster"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
