'use client'

import { useSyncExternalStore } from 'react'
import { useCountry } from '@/context/CountryContext'
import ProviderBadge from '@/components/ProviderBadge'
import CountrySelector from '@/components/CountrySelector'
import VpnSuggestion from '@/components/VpnSuggestion'
import { estadoEstreno, hoyLocal, mensajeEstreno, type EstrenoRef } from '@/lib/estreno-pais'

interface Provider {
  provider_id: number
  provider_name: string
  logo_path: string
}

interface RegionData {
  flatrate?: Provider[]
  /**
   * Gratis con publicidad. TMDB lo devuelve aparte de `flatrate` y hasta ahora
   * esta sección lo ignoraba: un título que en tu país está gratis en Pluto TV
   * figuraba como "no hay información". Cuenta como disponible, y de hecho es
   * la mejor forma de estarlo.
   */
  ads?: Provider[]
  rent?: Provider[]
  buy?: Provider[]
  link?: string
}

interface Props {
  results: Record<string, RegionData>
  mediaType: 'movie' | 'tv'
  mediaId: number
  /**
   * Para decir "todavía no se estrenó" o "solo en cines" cuando en el país no
   * hay plataformas (ver `lib/estreno-pais.ts`). Sin esto, el mensaje de siempre.
   */
  estreno?: EstrenoRef
  /** Hoy ('AAAA-MM-DD') según el servidor que armó la ficha: el HTML sale con esa fecha. */
  hoyServidor?: string
}

const sinSuscripcion = () => () => {}

/**
 * Hoy, sin romper la hidratación: el HTML (y el primer render en el navegador)
 * usan la fecha del servidor; después, la del navegador. La ficha se cachea un
 * día en la CDN y un estreno puede haber pasado entre tanto.
 */
function useHoy(hoyServidor: string | undefined): string {
  return useSyncExternalStore(sinSuscripcion, hoyLocal, () => hoyServidor ?? hoyLocal())
}

export default function StreamingSection({ results, mediaType, mediaId, estreno, hoyServidor }: Props) {
  const { country, countryData } = useCountry()
  const region = results[country] ?? {}
  const hasData = region.flatrate || region.ads || region.rent || region.buy
  const hoy = useHoy(hoyServidor)
  // Sólo sin plataformas; con plataformas no cambia nada. Se recalcula al
  // cambiar de país en el selector, con las fechas de ese país.
  const mensaje = !hasData && estreno ? mensajeEstreno(estadoEstreno(estreno, country, hoy), hoy) : null

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Disponible en streaming</h2>
        <CountrySelector variant="full" align="right" />
      </div>
      {!hasData ? (
        <p className="text-[#A0A0B0]">
          {mensaje ?? `No hay información de streaming disponible para ${countryData.name}.`}
        </p>
      ) : (
        <div className="bg-[#13131A] rounded-xl p-6">
          <ProviderBadge providers={region.flatrate ?? []} label="Incluido en suscripción" tmdbLink={region.link} mediaType={mediaType} mediaId={mediaId} />
          <ProviderBadge providers={region.ads ?? []}      label="Gratis con publicidad"   tmdbLink={region.link} mediaType={mediaType} mediaId={mediaId} />
          <ProviderBadge providers={region.rent ?? []}     label="Alquiler"                tmdbLink={region.link} mediaType={mediaType} mediaId={mediaId} />
          <ProviderBadge providers={region.buy ?? []}      label="Compra"                  tmdbLink={region.link} mediaType={mediaType} mediaId={mediaId} />
        </div>
      )}
      {/*
        Va en las dos ramas, no sólo en la de "no hay información": ahora el
        bloque también aparece cuando en tu país hay algo pero no una de las
        plataformas grandes —MovistarTV, o sólo alquiler—. Cuál de los tres
        casos es, y si corresponde mostrar algo, lo decide el propio componente
        con los mismos `results`; ver su comentario de arriba.
      */}
      <VpnSuggestion results={results} country={country} mediaType={mediaType} mediaId={mediaId} />
    </div>
  )
}
