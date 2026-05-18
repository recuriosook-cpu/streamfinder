'use client'

import { useCountry } from '@/context/CountryContext'
import ProviderBadge from '@/components/ProviderBadge'
import CountrySelector from '@/components/CountrySelector'

interface Provider {
  provider_id: number
  provider_name: string
  logo_path: string
}

interface RegionData {
  flatrate?: Provider[]
  rent?: Provider[]
  buy?: Provider[]
  link?: string
}

interface Props {
  results: Record<string, RegionData>
}

export default function StreamingSection({ results }: Props) {
  const { country, countryData } = useCountry()
  const region = results[country] ?? {}
  const hasData = region.flatrate || region.rent || region.buy

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Disponible en streaming</h2>
        <CountrySelector variant="full" align="right" />
      </div>
      {!hasData ? (
        <p className="text-[#A0A0B0]">
          No hay información de streaming disponible para {countryData.name}.
        </p>
      ) : (
        <div className="bg-[#13131A] rounded-xl p-6">
          <ProviderBadge providers={region.flatrate ?? []} label="Incluido en suscripción" tmdbLink={region.link} />
          <ProviderBadge providers={region.rent ?? []}     label="Alquiler"                tmdbLink={region.link} />
          <ProviderBadge providers={region.buy ?? []}      label="Compra"                  tmdbLink={region.link} />
        </div>
      )}
    </div>
  )
}
