'use client'

import { useState } from 'react'
import { track, flushAnalytics } from '@/lib/analytics'
import { GooglePlayBadge } from '@/components/GooglePlayBadge'
import { AppStoreBadge } from '@/components/AppStoreBadge'
import type { Dispositivo } from '@/lib/device'

/**
 * Potion Bottle, al pie de `/descargar`.
 *
 * Queda debajo de la primera pantalla —la de Glynbox, que sigue ocupando el
 * alto completo— y se llega scrolleando. El banner y el botón "Jugar" hacen lo
 * mismo:
 *
 *   - Android        → la ficha de Google Play.
 *   - iPhone / iPad  → la ficha de la App Store.
 *   - Computadora    → no sale de la página: despliega los dos badges para que
 *                      elija, porque no sabemos qué teléfono tiene.
 *
 * En el teléfono son links de verdad (`<a href>`) y no botones con JS: el
 * aparato ya llega resuelto del servidor, así que el destino está en el HTML
 * desde el primer byte y funciona aunque la hidratación todavía no terminó.
 *
 * Mismo tamaño de badge que el pie de la landing (180 de ancho el de Google,
 * y el de Apple a la misma altura dibujada; ver `BadgesTiendas`).
 */

const PAQUETE_ANDROID = 'com.potionbottle.watersort'

// El `referrer` hace que Play Console cuente estas instalaciones como venidas
// de Glynbox en vez de mezclarlas con las orgánicas.
const URL_PLAY =
  `https://play.google.com/store/apps/details?id=${PAQUETE_ANDROID}` +
  `&referrer=${encodeURIComponent('utm_source=glynbox&utm_medium=descargar&utm_campaign=potion')}`

const URL_APP_STORE = 'https://apps.apple.com/app/id6827137001'

const ANCHO_BADGE = 180
const ALTO_APPLE = Math.round((ANCHO_BADGE * 192) / 646)

type Destino = 'play_store' | 'app_store' | 'elegir'
type Desde = 'banner' | 'boton' | 'badge'

export function SeccionPotion({ dispositivo }: { dispositivo: Dispositivo }) {
  const [eligiendo, setEligiendo] = useState(false)

  const registrar = (destino: Destino, desde: Desde) => {
    track('descargar_potion_clicked', { dispositivo, destino, desde })
    // Los que salen de la página se llevan la cola de analytics con ellos.
    if (destino !== 'elegir') flushAnalytics()
  }

  const urlDirecta =
    dispositivo === 'android' ? URL_PLAY :
    dispositivo === 'ios'     ? URL_APP_STORE :
    null

  const destinoDirecto: Destino = dispositivo === 'android' ? 'play_store' : 'app_store'

  const banner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/potion-bottle/destacado.webp"
      alt="Potion Bottle: Water Sort Puzzle"
      width={1024}
      height={500}
      loading="lazy"
      decoding="async"
      className="block h-auto w-full rounded-2xl ring-1 ring-white/10 transition-transform duration-200 group-hover:scale-[1.01] group-active:scale-[0.99]"
    />
  )

  const claseBoton =
    'block w-full rounded-full bg-[#FFFD02] px-6 py-4 text-center text-[1.0625rem] ' +
    'font-semibold text-[#0A0A0F] transition-opacity hover:opacity-90 active:opacity-80'

  return (
    <section
      id="potion"
      aria-labelledby="potion-titulo"
      className="relative z-10 shrink-0 border-t border-[#1A1A24] px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16"
    >
      <div className="mx-auto w-full max-w-lg text-center">
        <p
          id="potion-titulo"
          className="mb-5 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[#6B6B7B]"
        >
          Probá nuestro juego
        </p>

        {urlDirecta ? (
          <>
            <a
              href={urlDirecta}
              onClick={() => registrar(destinoDirecto, 'banner')}
              aria-label="Jugar a Potion Bottle"
              className="group block"
            >
              {banner}
            </a>
            <div className="mx-auto mt-6 w-full max-w-sm">
              <a href={urlDirecta} onClick={() => registrar(destinoDirecto, 'boton')} className={claseBoton}>
                Jugar
              </a>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setEligiendo(true); registrar('elegir', 'banner') }}
              aria-label="Jugar a Potion Bottle"
              aria-expanded={eligiendo}
              aria-controls="potion-tiendas"
              className="group block w-full cursor-pointer"
            >
              {banner}
            </button>
            <div className="mx-auto mt-6 w-full max-w-sm">
              <button
                type="button"
                onClick={() => { setEligiendo(true); registrar('elegir', 'boton') }}
                aria-expanded={eligiendo}
                aria-controls="potion-tiendas"
                className={`${claseBoton} cursor-pointer`}
              >
                Jugar
              </button>
            </div>
            <div id="potion-tiendas" hidden={!eligiendo} className="mt-5">
              <div className="flex flex-wrap items-center justify-center gap-x-2">
                <AppStoreBadge
                  alto={ALTO_APPLE}
                  href={URL_APP_STORE}
                  onClick={() => registrar('app_store', 'badge')}
                />
                <GooglePlayBadge
                  ancho={`${ANCHO_BADGE}px`}
                  href={URL_PLAY}
                  onClick={() => registrar('play_store', 'badge')}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
