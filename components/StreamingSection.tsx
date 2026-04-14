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
        <span className="ml-2 text-base font-normal text-zinc-400">
          {countryData.flag} {countryData.name}
        </span>
      </h2>
      {!hasData ? (
        <p className="text-zinc-500">
          No hay información de streaming disponible para {countryData.name}.
        </p>
      ) : (
        <div className="bg-zinc-900 rounded-xl p-6">
          <ProviderBadge providers={region.flatrate ?? []} label="Incluido en suscripción" />
          <ProviderBadge providers={region.rent ?? []}     label="Alquiler" />
          <ProviderBadge providers={region.buy ?? []}      label="Compra" />
          {region.link && (
            <a
              href={region.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-sm text-emerald-400 hover:text-emerald-300"
            >
              Ver más opciones en JustWatch →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
