import Image from 'next/image'

interface Provider {
  provider_id: number
  provider_name: string
  logo_path: string
}

interface Props {
  providers: Provider[]
  label: string
  tmdbLink?: string
}

export default function ProviderBadge({ providers, label, tmdbLink }: Props) {
  if (!providers?.length) return null

  return (
    <div className="mb-6 last:mb-0">
      <p className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider mb-3">{label}</p>
      <div className="flex flex-wrap gap-4">
        {providers.map(p => {
          const logo = p.logo_path ? (
            <div className="relative w-14 h-14 sm:w-[72px] sm:h-[72px] rounded-xl overflow-hidden ring-1 ring-white/10 group-hover:ring-[#FFFD02]/50 transition-all">
              <Image
                src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                alt={p.provider_name}
                fill
                className="object-cover"
                sizes="72px"
              />
            </div>
          ) : null

          const name = (
            <p className="text-[10px] sm:text-xs text-[#A0A0B0] group-hover:text-white transition-colors text-center max-w-[72px] leading-tight mt-1.5 line-clamp-2">
              {p.provider_name}
            </p>
          )

          if (tmdbLink) {
            return (
              <a
                key={p.provider_id}
                href={tmdbLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center group"
                title={`Ver en ${p.provider_name}`}
              >
                {logo}
                {name}
              </a>
            )
          }

          return (
            <div key={p.provider_id} className="flex flex-col items-center group">
              {logo}
              {name}
            </div>
          )
        })}
      </div>
    </div>
  )
}
