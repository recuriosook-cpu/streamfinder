'use client'

import { useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { track, flushAnalytics } from '@/lib/analytics'
import { GooglePlayBadge } from '@/components/GooglePlayBadge'
import { refinarDispositivo, type Dispositivo } from '@/lib/device'

/**
 * La landing de descarga.
 *
 * Una sola pantalla, sin navbar ni pie —eso lo resuelve `ConditionalShell`, que
 * apaga el armazón del sitio en esta ruta igual que en `/admin`— y con un solo
 * botón grande que cambia según el aparato. Es la pantalla a la que apuntan las
 * campañas, así que todo lo que no sea el botón sobra.
 *
 * ── Por qué el dispositivo llega por prop y no se detecta acá ──────────────
 *
 * Lo detecta el Server Component con el header `user-agent` y lo baja por prop.
 * Detectarlo acá adentro obligaría a hacerlo en un efecto —`navigator` no
 * existe durante el render del servidor— y entonces la primera pintura saldría
 * sin botón o con el botón equivocado. En una pantalla cuyo único propósito es
 * el botón, eso es el peor error posible: es exactamente el frame que ve
 * alguien que llegó de un anuncio.
 *
 * El efecto de abajo igual refina el veredicto, pero sólo para el iPad que se
 * hace pasar por Mac. El porqué está en `lib/device.ts`.
 *
 * ── El link a Play Store es el badge oficial ───────────────────────────────
 *
 * Los dos lugares donde esta pantalla manda a Play Store —el botón principal en
 * Android y el link de abajo en escritorio— usan `GooglePlayBadge`, que sirve
 * el asset oficial sin modificar. Las condiciones de marca de Google piden eso
 * y prohíben armar un botón propio que lo imite, que es lo que había acá antes.
 *
 * De yapa, el URL de la tienda ahora vive en un solo archivo. Antes estaba
 * copiado en tres.
 */

/**
 * A dónde manda cada acción, en el vocabulario de la métrica.
 *
 * `glynbox_web` y no `'/'`: lo que se guarda en `analytics_events` tiene que
 * seguir significando lo mismo si mañana la ruta cambia.
 */
type Destino = 'play_store' | 'glynbox_web'

/**
 * Anchos del badge.
 *
 * El piso de marca son 40px de badge dibujado, que a esta proporción son ~135px
 * de ancho; los dos valores están bien por encima. El detalle está en
 * `components/GooglePlayBadge.tsx`.
 */
const ANCHO_BADGE_PRINCIPAL  = '260px'  // en Android es EL botón de la pantalla
const ANCHO_BADGE_SECUNDARIO = '180px'  // en escritorio es el link de abajo; igual que en el pie

/**
 * Una de las dos cosas que puede haber en cada ranura de la pantalla.
 *
 * Es una unión discriminada y no un objeto con campos opcionales porque las
 * cuatro formas no comparten nada: un badge no tiene texto propio, una nota no
 * tiene destino. Con campos opcionales habría que acordarse de cuáles van
 * juntos; así el `switch` de abajo no compila si falta un caso.
 *
 * `badge` no lleva `destino` ni `externo`: el badge siempre va a Play Store y
 * siempre es externo. Ponerlos sería dejar abierta la puerta a que alguien los
 * escriba mal y la métrica diga que un click al badge fue al sitio.
 */
type Accion =
  | { tipo: 'boton'; texto: string; href: string; externo: boolean; destino: Destino }
  | { tipo: 'badge'; ancho: string }
  | { tipo: 'link';  texto: string; href: string; externo: boolean; destino: Destino }
  | { tipo: 'nota';  texto: string }

interface Variante {
  principal:  Accion
  secundario: Accion
}

/**
 * Las tres variantes.
 *
 * En una tabla y no en un `if` desparramado por el JSX porque son tres casos
 * con la misma forma: lo único que cambia entre ellos son textos y destinos.
 * Así se leen los tres de un vistazo, y agregar el cuarto —el día que exista la
 * app de iPhone— es cambiar una entrada, no buscar condicionales.
 */
const VARIANTES: Record<Dispositivo, Variante> = {
  // Android es el único caso donde hay algo para instalar, así que el badge de
  // la tienda es EL botón de la pantalla y el sitio queda como alternativa.
  android: {
    principal:  { tipo: 'badge', ancho: ANCHO_BADGE_PRINCIPAL },
    secundario: { tipo: 'link', texto: 'O usala desde el navegador', href: '/', externo: false, destino: 'glynbox_web' },
  },

  // En iPhone no hay app todavía. El botón grande lleva al sitio, que funciona
  // perfecto, y abajo se avisa en chico para que nadie se vaya pensando que
  // Glynbox no existe para iOS.
  ios: {
    principal:  { tipo: 'boton', texto: 'Entrar a Glynbox', href: '/', externo: false, destino: 'glynbox_web' },
    secundario: { tipo: 'nota', texto: 'La app para iPhone está en camino' },
  },

  // En escritorio no se puede instalar nada, pero el badge igual sirve: es
  // gente que después agarra el teléfono.
  desktop: {
    principal:  { tipo: 'boton', texto: 'Entrar a Glynbox', href: '/', externo: false, destino: 'glynbox_web' },
    secundario: { tipo: 'badge', ancho: ANCHO_BADGE_SECUNDARIO },
  },
}

/**
 * Ya se registró la visita en esta carga de la página.
 *
 * A nivel de módulo y no en un `useRef`, por el mismo motivo que el `lastPath`
 * de `PageViewTracker`: en desarrollo React monta, desmonta y vuelve a montar
 * cada efecto, y un ref nace de nuevo en cada montaje. Una variable de módulo
 * sobrevive y el evento sale una sola vez.
 *
 * El costo conocido: si alguien llega a `/descargar`, navega al sitio y vuelve
 * con el botón de atrás sin recargar, la segunda visita no se cuenta. Se acepta
 * a propósito. A esta pantalla se llega desde afuera —un anuncio, un QR, un
 * link en una biografía—, o sea con carga completa, y en ese caso el módulo se
 * evalúa de nuevo y el contador arranca limpio. Contar de menos un rebote
 * interno vale mucho menos que inflar las visitas con remontajes.
 */
let visitaRegistrada = false

/**
 * `useSyncExternalStore` necesita una función de suscripción, pero acá no hay
 * nada a qué suscribirse: el aparato no cambia mientras la página está abierta.
 * Se pasa una que no notifica nunca y devuelve un `unsubscribe` vacío.
 *
 * Definida a nivel de módulo porque tiene que ser estable entre renders; una
 * función nueva en cada render haría que React se resuscriba cada vez.
 */
const noHayASuscribirse = () => () => {}

export default function DescargarClient({ dispositivoInicial }: { dispositivoInicial: Dispositivo }) {
  /**
   * El aparato que se usa para elegir la variante.
   *
   * ── Por qué `useSyncExternalStore` y no `useState` + `useEffect` ──────────
   *
   * El valor del servidor y el del cliente pueden diferir —el iPad que se hace
   * pasar por Mac, ver `lib/device.ts`— y ese es exactamente el problema que
   * este hook resuelve. Le das dos lecturas, una para cada lado, y React se
   * encarga de usar la del servidor durante la hidratación y cambiar a la del
   * cliente después, sin que salte un error de markup desparejo.
   *
   * La alternativa clásica —guardar en estado y corregirlo desde un efecto—
   * hace lo mismo pero peor: es un `setState` sincrónico adentro de un efecto,
   * que dispara un render en cascada y que el lint de React marca con razón.
   * Y leerlo durante el render con un `useState(() => refinar(...))` sería peor
   * todavía: el servidor pintaría una variante, el cliente otra, y eso es
   * justamente un mismatch de hidratación.
   *
   * `refinarDispositivo` devuelve un string, así que el `Object.is` con el que
   * React compara snapshots da estable y no hay riesgo de re-render infinito.
   */
  const dispositivo = useSyncExternalStore(
    noHayASuscribirse,
    () => refinarDispositivo(dispositivoInicial),  // en el navegador
    () => dispositivoInicial,                      // en el servidor y al hidratar
  )

  useEffect(() => {
    if (visitaRegistrada) return
    visitaRegistrada = true

    /*
      Se vuelve a refinar acá en vez de usar `dispositivo`, y no es redundante.
      Los efectos del primer commit corren todavía con el snapshot del
      servidor: React recién cambia al del cliente después de hidratar. O sea
      que en un iPad `dispositivo` acá adentro valdría `'desktop'` y la visita
      quedaría guardada con el aparato equivocado — justo el caso que toda esta
      maquinaria existe para distinguir.

      `refinarDispositivo` es pura y barata, y adentro de un efecto `navigator`
      ya está disponible.
    */
    track('descargar_viewed', { dispositivo: refinarDispositivo(dispositivoInicial) })
  }, [dispositivoInicial])

  /**
   * "Una sola pantalla, sin scroll."
   *
   * El contenedor mide `100svh` —la altura chica del viewport, la que queda
   * cuando el navegador móvil muestra sus barras— así que por sí solo nunca
   * desborda. El problema es el `<body>`, que el layout raíz deja en
   * `min-h-screen`: eso es `100vh`, y en móvil `100vh` es la altura GRANDE, la
   * de cuando las barras están escondidas. O sea que el body mide más que lo
   * visible y la página scrollea unos pixeles aunque el contenido entre.
   *
   * Por eso se bloquea el scroll del body mientras esta pantalla está montada,
   * y se restaura el valor anterior al salir en vez de escribir `''` a lo
   * bruto. Es el mismo patrón que usa `AppDownloadBar` con el padding.
   *
   * El cleanup no es decorativo: los botones que llevan al sitio son navegación
   * del cliente, así que este componente se desmonta y la página de destino
   * tiene que poder scrollear.
   */
  useEffect(() => {
    const previo = document.body.style.overflow
    try { document.body.style.overflow = 'hidden' } catch { /* silencio */ }
    return () => {
      try { document.body.style.overflow = previo } catch { /* silencio */ }
    }
  }, [])

  const { principal, secundario } = VARIANTES[dispositivo]

  /**
   * Registra el click.
   *
   * El `flush` sólo cuando el destino es externo. Los eventos se mandan de a
   * lotes cada 5 segundos, así que un click que se lleva la página perdería
   * justo el evento que más importa; `flushAnalytics` usa `sendBeacon`, que es
   * lo único que el navegador garantiza con la página muriendo. Para los links
   * internos no hace falta —es navegación del cliente, la cola sigue viva— y
   * forzarlo sería un request de más por cada click.
   *
   * El caso del badge es el único que no pasa por el `if`: `GooglePlayBadge`
   * hace el flush por su cuenta, siempre, porque su destino es externo por
   * definición.
   */
  const registrarClick = (destino: Destino, boton: 'principal' | 'secundario', externo: boolean) => {
    track('descargar_clicked', { dispositivo, destino, boton })
    if (externo) flushAnalytics()
  }

  /** Mismo botón amarillo lleve a donde lleve. */
  const claseBoton =
    'block w-full rounded-full bg-[#FFFD02] px-6 py-4 text-center text-[1.0625rem] ' +
    'font-semibold text-[#0A0A0F] transition-opacity hover:opacity-90 active:opacity-80'

  /** Mismo link chico lleve a donde lleve. */
  const claseLinkChico =
    'text-[0.8125rem] text-[#A0A0B0] underline decoration-[#2A2A3A] underline-offset-4 ' +
    'transition-colors hover:text-white hover:decoration-[#A0A0B0]'

  /**
   * Dibuja una ranura.
   *
   * Un `switch` sobre la unión y no una cadena de ternarios anidados: con
   * cuatro formas los ternarios se vuelven ilegibles, y además así TypeScript
   * avisa si mañana se agrega un `tipo` y alguien se olvida de contemplarlo.
   */
  const renderAccion = (accion: Accion, ranura: 'principal' | 'secundario') => {
    switch (accion.tipo) {
      case 'badge':
        return (
          <GooglePlayBadge
            ancho={accion.ancho}
            onClick={() => registrarClick('play_store', ranura, true)}
          />
        )

      case 'boton':
        return accion.externo ? (
          <a
            href={accion.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => registrarClick(accion.destino, ranura, true)}
            className={claseBoton}
          >
            {accion.texto}
          </a>
        ) : (
          <Link
            href={accion.href}
            onClick={() => registrarClick(accion.destino, ranura, false)}
            className={claseBoton}
          >
            {accion.texto}
          </Link>
        )

      case 'link':
        return accion.externo ? (
          <a
            href={accion.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => registrarClick(accion.destino, ranura, true)}
            className={claseLinkChico}
          >
            {accion.texto}
          </a>
        ) : (
          <Link
            href={accion.href}
            onClick={() => registrarClick(accion.destino, ranura, false)}
            className={claseLinkChico}
          >
            {accion.texto}
          </Link>
        )

      case 'nota':
        return <p className="text-[0.8125rem] text-[#6B6B7B]">{accion.texto}</p>
    }
  }

  return (
    <div
      className="relative flex h-svh w-full flex-col overflow-x-hidden overflow-y-auto bg-[#0A0A0F] text-white"
      style={{
        // Los teléfonos con notch y con gesto de home se comen los bordes. Sin
        // esto el logo queda debajo de la cámara y el link chico de abajo queda
        // tapado por la barra del sistema.
        paddingTop:    'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/*
        Un resplandor de marca arriba, detrás de todo.
        `pointer-events-none` porque es decoración y no tiene que robarle ningún
        toque al botón, y `aria-hidden` porque no dice nada.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[55vh]"
        style={{
          background:
            'radial-gradient(ellipse 120% 70% at 50% 0%, rgba(255,253,2,0.13) 0%, rgba(255,253,2,0.04) 38%, rgba(10,10,15,0) 72%)',
        }}
      />

      <header className="relative z-10 flex shrink-0 justify-center px-6 pt-9 sm:pt-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Glynbox"
          width={2098}
          height={437}
          style={{ height: '34px', width: 'auto', objectFit: 'contain' }}
        />
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-8">
        {/*
          La columna se ensancha en pantallas grandes y la de los botones no.

          A 384px —el ancho de móvil— el título en escritorio partía en dos y
          dejaba "hoy?" solo en la segunda línea, que es el corte más feo
          posible. Con `sm:max-w-lg` entra en un renglón. Los botones se quedan
          en `max-w-sm` con su propio contenedor: un botón amarillo de 512px de
          ancho en un monitor no se lee como un botón, se lee como una barra.
        */}
        <div className="w-full max-w-sm text-center sm:max-w-lg">

          <h1 className="text-[2rem] font-bold leading-[1.1] tracking-tight text-white sm:text-[2.6rem]">
            ¿No sabés qué ver hoy?
          </h1>

          <p className="mx-auto mt-4 max-w-[19rem] text-[0.975rem] leading-relaxed text-[#A0A0B0] sm:max-w-none sm:text-base">
            Encontrá dónde ver cualquier peli o serie en tu país. Gratis.
          </p>

          <div className="mx-auto mt-9 w-full max-w-sm sm:mt-10">
            {/*
              Centrado con flex y no con `text-center` heredado: el badge es un
              `inline-block` con ancho propio, así que necesita que lo centre el
              contenedor. El botón amarillo es `w-full` y le da igual.
            */}
            <div className="flex justify-center">
              {renderAccion(principal, 'principal')}
            </div>

            {/*
              La ranura de abajo ya NO reserva un alto fijo.

              Mientras las tres variantes tenían texto ahí, un `min-h` alcanzaba
              para que el botón quedara siempre a la misma altura. Ahora en
              escritorio hay un badge de ~70px y en iOS una línea de ~20px, así
              que igualarlas significaría dejar 50px de aire muerto en Android e
              iOS — en la pantalla que no puede scrollear y en el aparato que es
              el objetivo de la campaña.

              La consecuencia: en un iPad, cuando el refinamiento corrige
              `desktop` → `ios` justo después de hidratar, el badge se
              reemplaza por la línea de texto y el bloque se acomoda. Es un
              salto de una vez, en un solo tipo de aparato, en el instante
              anterior a que nadie haya leído nada. Se prefiere eso antes que
              el aire permanente.
            */}
            <div className="mt-5 flex items-center justify-center">
              {renderAccion(secundario, 'secundario')}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
