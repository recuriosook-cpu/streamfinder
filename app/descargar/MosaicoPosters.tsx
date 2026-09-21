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
 * ── Por qué las tiras repiten la lista cinco veces ─────────────────────────
 *
 * Una tira se anima corriéndose exactamente el ancho de UNA copia y vuelve a
 * empezar. Como la copia siguiente arranca justo donde estaba la anterior, el
 * salto del reinicio es invisible y la fila parece infinita.
 *
 * Eso pide dos copias como mínimo, pero dos no alcanzan: cuando la tira está
 * corrida una copia entera, lo que queda tapando la fila es solamente la copia
 * que sobra, y si esa copia mide menos que la pantalla aparece un vacío negro
 * a la derecha. Con seis posters por fila una copia mide ~650px, así que en un
 * monitor cualquiera se veía el agujero. `COPIAS` es el número que garantiza
 * que siempre sobre pantalla de más.
 *
 * Son muchas etiquetas `<img>` y ninguna descarga extra: las URLs son las
 * mismas seis por fila y el navegador las pide una sola vez.
 *
 * El desplazamiento se mide en píxeles reales —`--mosaico-n` por el ancho de
 * un poster— y no con un porcentaje del total. Con `-50%` la distancia
 * dependería de cuántas copias haya, y agregar una rompería el empalme.
 *
 * Por lo mismo la separación entre posters es un `margin-right` y no un `gap`
 * de flex: el `gap` no se aplica después del último ítem, así que la copia
 * siguiente no empezaría a un ancho exacto de la anterior y cada vuelta
 * pegaría un tironcito de medio espacio.
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
 * Cuántas veces se repite la lista de una fila dentro de su tira.
 *
 * Cinco cubre hasta unos 2500px de ancho de pantalla, que es más que cualquier
 * monitor que vaya a abrir esto. El porqué de que no alcancen dos está en la
 * nota de arriba.
 */
const COPIAS = 5

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
            <div
              className="mosaico-tira"
              /*
                Cuántos posters tiene una copia. El CSS lo necesita para saber
                cuánto correr la tira en cada vuelta, y se lo pasamos desde acá
                porque el reparto puede no dar seis exactos si TMDB devolvió
                menos de lo pedido.
              */
              style={{ '--mosaico-n': fila.length } as React.CSSProperties}
            >
              {Array.from({ length: COPIAS }, () => fila).flat().map((ruta, j) => (
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
