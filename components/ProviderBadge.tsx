import Image from 'next/image'
import { buildProviderUrl } from '@/lib/providers'

interface Provider {
  provider_id: number
  provider_name: string
  logo_path: string
}

interface Props {
  providers: Provider[]
  label: string
  /** Original (English) title used to build the search URL */
  originalTitle: string
}

export default function ProviderBadge({ providers, label, originalTitle }: Props) {
  if (!providers?.length) return null
  return (
    <div className="mb-4">
      <p className="text-xs text-zinc-400 uppercase tracking-wider mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {providers.map(p => {
          const href = buildProviderUrl(p.provider_id, originalTitle)
          const badge = (
            <div className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-700">
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
          )
          return href ? (
            <a
              key={p.provider_id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={`Buscar "${originalTitle}" en ${p.provider_name}`}
            >
              {badge}
            </a>
          ) : (
            <div key={p.provider_id}>{badge}</div>
          )
        })}
      </div>
    </div>
  )
}
