import Link from 'next/link'
import { BadgesTiendas } from '@/components/BadgesTiendas'
import { MosaicoPosters } from '@/app/descargar/MosaicoPosters'

/**
 * La portada de www.glynbox.com para quien no tiene sesión.
 *
 * Existe por la verificación de marca de Google (el "Continuar con Google"):
 * la rechazaron porque la página principal pedía iniciar sesión, no explicaba
 * para qué es la app y no mostraba claramente el nombre "Glynbox". Esta
 * portada dice el nombre en texto (no sólo en el logo), explica la app en dos
 * líneas, lleva a las tiendas y deja a la vista Privacidad y Términos, los dos
 * links que Google pide en la pantalla de consentimiento.
 *
 * Es un Server Component a propósito: el HTML sale con todo el contenido ya
 * escrito, así lo lee igual un verificador, Googlebot o un navegador sin
 * JavaScript. La portada anterior se armaba entera en el navegador.
 *
 * Reusa las piezas de `/descargar` (los badges oficiales y el mosaico), pero
 * no la pantalla: aquella es de campañas, cuenta sus visitas en
 * `descargar_viewed` y no nombra la app.
 */

/** La marca de los links a las tiendas, para separar estas descargas en Play y App Store. */
const MARCA = { medio: 'web', campana: 'portada' } as const

export default function PortadaPublica({ posters }: { posters: string[] }) {
  const claseLegal =
    'text-[#A0A0B0] underline decoration-[#2A2A3A] underline-offset-4 transition-colors hover:text-white'

  return (
    <main className="relative flex min-h-[calc(100svh-64px)] w-full flex-col overflow-hidden bg-[#0A0A0F] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[55vh]"
        style={{
          background:
            'radial-gradient(ellipse 120% 70% at 50% 0%, rgba(255,253,2,0.13) 0%, rgba(255,253,2,0.04) 38%, rgba(10,10,15,0) 72%)',
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center px-6 pt-12 text-center sm:pt-16">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt=""
          width={2098}
          height={437}
          style={{ height: '40px', width: 'auto', objectFit: 'contain' }}
        />

        <h1 className="mt-8 text-[2.5rem] font-bold leading-none tracking-tight sm:text-[3.25rem]">
          Glynbox
        </h1>
        <p className="mt-3 text-lg font-semibold text-[#FFFD02] sm:text-xl">
          Descubrí qué ver en tus plataformas
        </p>

        <p className="mt-5 max-w-md text-[0.975rem] leading-relaxed text-[#C8C8D2] sm:text-base">
          Glynbox es una app gratuita para encontrar películas y series según las plataformas
          que tenés (Netflix, Disney+, Prime Video y más). Calificá lo que viste y recibí
          recomendaciones a tu medida.
        </p>

        <div className="mt-8">
          <BadgesTiendas dispositivo="desktop" tamano="normal" marca={MARCA} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
          <Link href="/auth" className="font-semibold text-white hover:text-[#FFFD02]">
            Entrar desde el navegador
          </Link>
          <Link href="/?explorar=1" className="text-[#A0A0B0] hover:text-white">
            Explorar sin cuenta
          </Link>
        </div>
      </div>

      <div className="relative mt-10 flex h-48 min-h-0 sm:h-56">
        <MosaicoPosters posters={posters} />
      </div>

      <nav
        aria-label="Legales"
        className="relative z-10 mx-auto mt-auto flex flex-wrap justify-center gap-x-6 gap-y-2 px-6 py-8 text-sm"
      >
        <Link href="/privacidad" className={claseLegal}>Política de privacidad</Link>
        <Link href="/terminos" className={claseLegal}>Términos y condiciones</Link>
        <Link href="/soporte" className={claseLegal}>Soporte</Link>
      </nav>
    </main>
  )
}
