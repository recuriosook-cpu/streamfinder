'use client'

import { useSyncExternalStore } from 'react'
import { COUNTRIES, getCountry } from '@/lib/countries'
import { FlagCircle } from '@/components/CountrySelector'
import ProviderBadge from '@/components/ProviderBadge'
import { familiaGrande } from '@/lib/providers'
import { isRunningInApp } from '@/lib/app-mode'
import { track } from '@/lib/analytics'

/**
 * "No está en tu país, pero sí en estos otros" + el enlace de afiliado.
 *
 * ── Cuándo aparece ────────────────────────────────────────────────────────
 *
 * La pregunta no es "¿se puede ver?" sino "¿se puede ver donde vale la pena
 * mirarlo?". Un título que en tu país está sólo en MovistarTV, o sólo para
 * alquilar, está técnicamente disponible y aun así quien lo busca sigue sin
 * poder abrirlo con las suscripciones que ya paga. Ese es el caso que este
 * bloque atiende, y por eso la regla mira `PLATAFORMAS_GRANDES`
 * (`lib/providers.ts`) y no el "hay algo / no hay nada" de antes:
 *
 *   1. Hay una plataforma grande en tu país → no se muestra nada. Ya lo podés
 *      ver donde es razonable verlo.
 *
 *   2. Hay algo, pero ninguna plataforma grande → se muestra, y sólo con los
 *      países donde sí está en una grande, y sólo con esas grandes. Mostrar
 *      acá el canal local de otro país sería cambiar un servicio de nicho por
 *      otro, que no es motivo para contratar una VPN.
 *
 *   3. No hay absolutamente nada → se muestra con cualquier plataforma de
 *      cualquier país. Con la vara alta no quedaría nada que ofrecer, y
 *      cualquier forma de verlo es mejor que ninguna.
 *
 * Las tres las decide este componente, no quien lo monta: `StreamingSection`
 * lo renderiza siempre y acá se devuelve `null` cuando no corresponde. Es una
 * sola regla y conviene que tenga un solo lugar donde leerse.
 *
 * "Plataforma grande" se mide sólo sobre `flatrate` y `ads`. Que Prime Video
 * te alquile la película no es estar en Prime Video, igual que para el punto 2.
 *
 * ── Por qué no aparece en el HTML que cachea el CDN ────────────────────────
 *
 * Las fichas son ISR de una hora con `generateStaticParams`, así que el HTML
 * que sirve el CDN se genera una vez y se le entrega a todo el mundo. En ese
 * render, del lado del servidor, `useCountry()` todavía devuelve el default
 * (`AR`): no hay header de geo ni cookie que lo cambie. Un componente que
 * decidiera ahí quedaría horneado con la respuesta de Argentina para todos.
 *
 * De ahí el flag `visible`, que en el servidor vale `false` siempre. Ahí el
 * componente devuelve `null`, así que el bloque —y el enlace de afiliado— no
 * existe en el HTML prerenderizado. No es una optimización: es el requisito.
 * Un enlace de afiliado horneado en el HTML estático lo ve Googlebot, lo ve
 * quien tenga JavaScript desactivado, y lo ve cualquier cosa que lea la página
 * antes de que corra un solo script.
 *
 * El flag sale de `useSyncExternalStore` y no de un `useState` + `useEffect`
 * porque es exactamente la pregunta que ese hook contesta: un valor que en el
 * servidor es uno y en el navegador es otro. La versión con efecto además no
 * pasa el lint —`react-hooks/set-state-in-effect`, del React Compiler— y con
 * razón: obliga a un render intermedio que existe sólo para ser descartado.
 *
 * ── Y por qué el mismo flag mira `isRunningInApp()` ────────────────────────
 *
 * El bloque es sólo de la web. Promocionar una VPN para acceder al catálogo de
 * otra región es zona gris con las políticas de Google Play, y no vale la pena
 * arriesgar una revisión por eso.
 *
 * La app de hoy es nativa y no renderiza estas fichas, así que el gate no
 * debería activarse nunca. Está igual por la TWA vieja: alguien que la instaló
 * y no actualizó sigue abriendo glynbox.com adentro de una app firmada con
 * `com.glynbox.app` (ver `public/.well-known/assetlinks.json`). A esa persona
 * el bloque no tiene que salirle, y `lib/app-mode.ts` ya sabe reconocerla.
 *
 * Las dos condiciones van en el mismo flag porque las dos se contestan en el
 * mismo momento —después de montar, en el navegador— y porque así hay un solo
 * camino que puede devolver el bloque en vez de dos.
 */

interface Provider {
  provider_id: number
  provider_name: string
  logo_path: string
}

interface RegionData {
  flatrate?: Provider[]
  ads?: Provider[]
  rent?: Provider[]
  buy?: Provider[]
  link?: string
}

interface Props {
  results: Record<string, RegionData>
  /** El país ya resuelto por `useCountry()`, tal como lo usa la sección. */
  country: string
  mediaType: 'movie' | 'tv'
  mediaId: number
}

/** El único enlace de afiliado. */
const AFILIADO_URL = 'https://get.surfshark.net/aff_c?offer_id=926&aff_id=1768'

/** Tres banderas. Cuatro ya es una lista, y una lista es un banner. */
const MAX_PAISES = 3

/**
 * El orden en que se eligen los países, de más relevante a menos.
 *
 * Los cuatro primeros son los que le importan a una audiencia rioplatense: el
 * catálogo de Estados Unidos es el más grande, y España y México son los dos
 * con doblaje y subtitulado en español. El resto es relleno para los casos en
 * que ninguno de esos cuatro tenga el título.
 */
const PRIORIDAD: string[] = ['US', 'ES', 'MX', 'GB', 'CA', 'BR', 'FR', 'DE', 'IT']

/**
 * Prioridad primero, después el resto de los países del selector.
 *
 * Se recorre siempre en este orden y no en el que venga el objeto de TMDB. Que
 * sea determinista importa: si dependiera del orden de las claves, dos
 * personas en el mismo país podrían ver banderas distintas para el mismo
 * título, y no habría forma de reproducir un reporte.
 *
 * Los países que no están en `COUNTRIES` quedan afuera del todo. Es la lista
 * que ya maneja el selector, con nombre en español y bandera, y no tiene
 * sentido ofrecerle a alguien un país que la propia ficha no sabe mostrar.
 */
const ORDEN: string[] = [
  ...PRIORIDAD,
  ...COUNTRIES.map(c => c.code).filter(code => !PRIORIDAD.includes(code)),
]

interface Destino {
  code: string
  providers: Provider[]
}

/**
 * El veredicto de `isRunningInApp()`, calculado una sola vez por carga.
 *
 * `useSyncExternalStore` llama a `getSnapshot` en cada render y compara el
 * resultado con `Object.is`, así que conviene que sea barato y estable.
 * `isRunningInApp()` toca `localStorage` y `matchMedia`; memorizarlo acá lo
 * deja en una lectura por carga de página.
 *
 * Que el cache viva en el módulo y no en el componente es a propósito: la
 * respuesta no cambia entre fichas, y `isRunningInApp()` ya es de una sola
 * dirección —cuando detecta la app se pega en `localStorage` y no se borra—
 * así que no hay nada que invalidar.
 */
let cacheFueraDeApp: boolean | null = null

function fueraDeLaApp(): boolean {
  if (cacheFueraDeApp === null) cacheFueraDeApp = !isRunningInApp()
  return cacheFueraDeApp
}

/** Nada a qué suscribirse: el valor no cambia durante la vida de la página. */
const sinSuscripcion = () => () => {}

/** En el servidor nunca se muestra. Ver el comentario de arriba. */
const enElServidor = () => false

/**
 * La identidad de una plataforma, para compararla con otra.
 *
 * La familia grande cuando la hay —así "Netflix" y "Netflix Standard with Ads"
 * son la misma cosa— y el `provider_id` pelado para todo lo demás, que es lo
 * mejor que se puede hacer sin una tabla de familias para los 896 proveedores
 * del catálogo de TMDB.
 */
function plataformaDe(p: Provider): string {
  return familiaGrande(p.provider_id) ?? `id:${p.provider_id}`
}

/** Lo que se puede ver con una suscripción —o gratis con publicidad— en una región. */
function porSuscripcion(region: RegionData): Provider[] {
  return [...(region.flatrate ?? []), ...(region.ads ?? [])]
}

/**
 * Los países que vale la pena ofrecer, ya recortados y ordenados.
 *
 * Dos reglas y un desempate:
 *
 *   1. **Sólo `flatrate` y `ads`.** Alquiler y compra quedan afuera a
 *      propósito. Una VPN te cambia la región del catálogo, no el medio de
 *      pago: alquilar en la tienda de otro país choca con la tarjeta y la
 *      promesa de "poné la VPN y miralo" deja de ser cierta. Lo gratis con
 *      publicidad sí entra, y es el mejor caso que puede darse.
 *
 *   2. **Nunca el país de quien mira.** En el caso 3 ahí no hay nada, pero en
 *      el 2 sí hay algo —lo que falta es una plataforma grande— y ofrecerle a
 *      alguien una VPN para "viajar" a su propio país no tendría sentido.
 *
 *   3. **`soloGrandes` recorta a `PLATAFORMAS_GRANDES`.** Es el caso 2 del
 *      comentario de arriba: el país entra sólo si tiene una grande, y del
 *      país se muestran nada más que las grandes.
 *
 * El desempate es por plataforma repetida: si Estados Unidos y México ofrecen
 * los dos nada más que Netflix, se queda el primero y se sigue buscando uno
 * que aporte algo distinto. Sin esto, el caso más común —un título de Netflix
 * que no llegó a la región— mostraría tres banderas diciendo "Netflix,
 * Netflix, Netflix", que ocupa lugar y no agrega una sola razón para hacer
 * click.
 *
 * "Repetida" se mide por familia y no por `provider_id`, porque un mismo
 * servicio tiene un ID por plan y por reventa. Sin esto, un país con "Netflix"
 * y otro con "Netflix Standard with Ads" pasarían por dos plataformas
 * distintas, y dentro de un mismo país saldrían dos logos de Paramount+ uno al
 * lado del otro.
 */
function elegirDestinos(
  results: Record<string, RegionData>,
  paisUsuario: string,
  soloGrandes: boolean,
): Destino[] {
  const elegidos: Destino[] = []
  const plataformasVistas = new Set<string>()

  for (const code of ORDEN) {
    if (elegidos.length >= MAX_PAISES) break
    if (code === paisUsuario) continue

    const region = results[code]
    if (!region) continue

    // Dedupe dentro del país: TMDB a veces repite el mismo proveedor en
    // `flatrate` y en `ads`, y casi siempre repite la plataforma en varios
    // planes.
    const providers: Provider[] = []
    const vistasAca = new Set<string>()
    for (const p of porSuscripcion(region)) {
      if (soloGrandes && !familiaGrande(p.provider_id)) continue
      const plataforma = plataformaDe(p)
      if (vistasAca.has(plataforma)) continue
      vistasAca.add(plataforma)
      providers.push(p)
    }
    if (providers.length === 0) continue

    // ¿Aporta alguna plataforma que no se haya nombrado ya?
    if (![...vistasAca].some(plataforma => !plataformasVistas.has(plataforma))) continue

    for (const plataforma of vistasAca) plataformasVistas.add(plataforma)
    elegidos.push({ code, providers })
  }

  return elegidos
}

export default function VpnSuggestion({ results, country, mediaType, mediaId }: Props) {
  // `false` en el servidor y en la app; `true` sólo en un navegador común, ya
  // hidratado.
  const visible = useSyncExternalStore(sinSuscripcion, fueraDeLaApp, enElServidor)

  if (!visible) return null

  const region = results[country] ?? {}

  // Regla 1: si ya está en una grande acá, no hay nada que sugerir.
  if (porSuscripcion(region).some(p => familiaGrande(p.provider_id))) return null

  // Regla 2 contra regla 3. `hayAlgo` es la misma pregunta que se hacía
  // `StreamingSection` para elegir su rama: cualquiera de las cuatro formas de
  // verlo, alquiler y compra incluidos.
  const hayAlgo = Boolean(region.flatrate || region.ads || region.rent || region.buy)

  const destinos = elegirDestinos(results, country, hayAlgo)
  if (destinos.length === 0) return null

  const onClick = () => {
    track('surfshark_click', {
      media_type:   mediaType,
      media_id:     mediaId,
      pais_destino: destinos[0].code,
    })
  }

  return (
    <div className="bg-[#13131A] rounded-xl p-6 mt-4">
      {destinos.map(({ code, providers }) => (
        <ProviderBadge
          key={code}
          providers={providers}
          label={
            <>
              <FlagCircle code={code} size={18} />
              Disponible en {getCountry(code).name}
            </>
          }
        />
      ))}

      {/*
        Sin `tmdbLink` a propósito, así que los logos son `div` y no links.
        El único destino del bloque es Surfshark —no tiene sentido mandar a
        alguien a la página de TMDB de un país donde igual no puede ver nada— y
        además cada logo con link emitiría `provider_click`, que mide otra cosa:
        clicks a plataformas disponibles en el país de quien mira.
      */}
      <div className="flex items-center gap-3 mt-6">
        <a
          href={AFILIADO_URL}
          target="_blank"
          rel="sponsored noopener noreferrer"
          onClick={onClick}
          className="inline-flex items-center justify-center shrink-0 rounded-full border border-[#FFFD02]/40 px-5 py-2.5 text-sm font-semibold text-[#FFFD02] hover:bg-[#FFFD02] hover:text-black transition-colors"
        >
          Ver con Surfshark
        </a>
        <span className="text-xs text-[#A0A0B0]">Patrocinado</span>
      </div>
    </div>
  )
}
