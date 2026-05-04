import Image from 'next/image'
import Link from 'next/link'

export interface CrewMember {
  id: number
  name: string
  job: string
  profilePath: string | null
}

function PersonAvatar() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-zinc-700">
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-[#A0A0B0]">
        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
      </svg>
    </div>
  )
}

function CrewCard({ member }: { member: CrewMember }) {
  return (
    <div className="flex items-center gap-3 bg-[#1C1C27]/60 border border-[#2A2A3A]/50 rounded-xl px-4 py-3">
      <div className="w-12 h-12 rounded-full overflow-hidden bg-[#1C1C27] shrink-0 ring-2 ring-zinc-700">
        {member.profilePath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w185${member.profilePath}`}
            alt={member.name}
            width={48}
            height={48}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <PersonAvatar />
        )}
      </div>
      <div className="min-w-0">
        {member.job === 'Director' ? (
          <Link href={`/director/${member.id}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors leading-tight truncate block">
            {member.name}
          </Link>
        ) : (
          <p className="text-sm font-semibold text-white leading-tight truncate">{member.name}</p>
        )}
        <p className="text-xs text-[#A0A0B0] mt-0.5">{member.job}</p>
      </div>
    </div>
  )
}

interface Props {
  crew: CrewMember[]
  title?: string
}

export default function CrewSection({ crew, title = 'Dirección y guion' }: Props) {
  if (crew.length === 0) return null

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      <div className="flex flex-wrap gap-3">
        {crew.map(member => (
          <CrewCard key={`${member.id}-${member.job}`} member={member} />
        ))}
      </div>
    </div>
  )
}
