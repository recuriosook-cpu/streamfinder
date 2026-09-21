import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { detectarDispositivo } from '@/lib/device'
import { obtenerPostersPopulares } from './posters'
import DescargarClient from './DescargarClient'

/**
 * `/descargar` — la pantalla a la que apuntan las campañas.
 *
 * Este archivo hace una sola cosa: mirar el `user-agent` del request y decidir
 * qué aparato es, para que el HTML que sale ya traiga el botón correcto. Todo
 * lo demás vive en `DescargarClient`.
 *
 * ── Por qué la detección va acá y no en el cliente ─────────────────────────
 *
 * Porque leer `navigator` obliga a esperar a un efecto, y un efecto corre
 * DESPUÉS de la primera pintura. En una pantalla cuyo único contenido es un
 * botón, eso significa que quien llega desde un anuncio ve primero un hueco —o
 * peor, el botón equivocado— y recién después lo que corresponde. Con el header
 * el primer byte ya sale bien.
 *
 * El costo es que la ruta pasa a ser dinámica: `headers()` es una API de tiempo
 * de request y saca la página del prerenderizado. Acá eso no se paga en nada,
 * porque no hay datos que cachear —es HTML fijo con tres variantes— y el
 * resultado depende justamente de quién pregunta. Una versión estática tendría
 * que decidirse por un dispositivo y equivocarse con los otros dos.
 *
 * ── El mosaico también se resuelve acá ─────────────────────────────────────
 *
 * Los posters de la cartelera se piden en el servidor, no en el navegador. Si
 * los buscara el cliente, la pantalla aparecería con el hueco vacío y se
 * llenaría un segundo después, que es la clase de movimiento que distrae justo
 * cuando la persona está por tocar el botón.
 *
 * Se esperan antes de responder, y eso alcanza porque casi nunca hay nada que
 * esperar: `obtenerPostersPopulares` guarda la respuesta de TMDB seis horas en
 * el Data Cache, así que sólo el primer visitante de cada ventana paga el viaje
 * de ida y vuelta. Y si TMDB no contesta, la función devuelve una lista vacía
 * en vez de tirar: la pantalla se dibuja sin mosaico y el botón sigue ahí.
 *
 * ── Sobre el armazón del sitio ─────────────────────────────────────────────
 *
 * El pedido era "sin menú ni header". Eso no se resuelve acá sino en
 * `components/ConditionalShell.tsx`, que es quien decide si el layout raíz
 * monta el navbar y el pie. Se agregó `/descargar` a esa lista junto a
 * `/admin`. De yapa, también apaga la barra de descarga flotante, que estaría
 * ofreciendo la app en la página que ya no hace otra cosa que ofrecerla.
 */

export const metadata: Metadata = {
  title: 'Descargá Glynbox — Encontrá dónde ver cualquier peli o serie',
  description:
    'Encontrá dónde ver cualquier película o serie en tu país. Gratis. Descargá la app de Glynbox o entrá desde el navegador.',
  alternates: { canonical: 'https://glynbox.com/descargar' },
  openGraph: {
    type: 'website',
    url: 'https://glynbox.com/descargar',
    siteName: 'Glynbox',
    title: '¿No sabés qué ver hoy?',
    description: 'Encontrá dónde ver cualquier peli o serie en tu país. Gratis.',
    images: [{ url: 'https://glynbox.com/logo.png', width: 1200, height: 630, alt: 'Glynbox' }],
  },
}

export default async function DescargarPage() {
  // En paralelo: el veredicto del user-agent no depende de los posters ni al
  // revés, y encadenarlos sumaría la espera de TMDB a la de los headers.
  const [cabeceras, posters] = await Promise.all([
    headers(),
    obtenerPostersPopulares(),
  ])

  const dispositivo = detectarDispositivo(cabeceras.get('user-agent'))

  return (
    <>
      {/*
        Las imágenes del mosaico salen de otro dominio, así que sin esto el
        navegador recién abre la conexión —DNS, TCP y TLS— cuando encuentra el
        primer `<img>`. React 19 lo sube solo al `<head>`.
      */}
      <link rel="preconnect" href="https://image.tmdb.org" />
      <DescargarClient dispositivoInicial={dispositivo} posters={posters} />
    </>
  )
}
