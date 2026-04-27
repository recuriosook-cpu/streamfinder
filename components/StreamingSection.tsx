'use client'

import { useCountry } from '@/context/CountryContext'
import ProviderBadge from '@/components/ProviderBadge'

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
      <h2 className="text-xl font-bold mb-4">
        Disponible en streaming
        <span className="ml-2 text-base font-normal text-[#A0A0B0]">
          {countryData.flag} {countryData.name}
        </span>
      </h2>
      {!hasData ? (
        <p className="text-[#A0A0B0]">
          No hay información de streaming disponible para {countryData.name}.
        </p>
      ) : (
        <div className="bg-[#13131A] rounded-xl p-6">
          <ProviderBadge providers={region.flatrate ?? []} label="Incluido en suscripción" />
          <ProviderBadge providers={region.rent ?? []}     label="Alquiler" />
          <ProviderBadge providers={region.buy ?? []}      label="Compra" />
        </div>
      )}
    </div>
  )
}
