import Image from 'next/image'

interface Provider {
  provider_id: number
  provider_name: string
  logo_path: string
}

interface Props {
  providers: Provider[]
  label: string
}

export default function ProviderBadge({ providers, label }: Props) {
  if (!providers?.length) return null
  return (
    <div className="mb-4">
      <p className="text-xs text-[#A0A0B0] uppercase tracking-wider mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {providers.map(p => (
          <div key={p.provider_id} className="flex items-center gap-1.5 bg-[#1C1C27] rounded-lg px-2 py-1.5">
            {p.logo_path && (
              <Image
                src={`https://image.tmdb.org/t/p/w45${p.logo_path}`}
                alt={p.provider_name}
                width={24}
                height={24}
                className="rounded"
              />
            )}
            <span className="text-xs text-white">{p.provider_name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
