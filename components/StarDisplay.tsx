import { Star } from 'lucide-react'

// Exported so interactive components (RatingStars, ReviewsSection) can reuse it.
// All three states wrap in the same inline-flex span so they have identical
// dimensions and flex-alignment behaviour when placed in a flex row.
export function StarIcon({
  fill,
  size,
  color = 'text-[#F5A623]',
}: {
  fill: 'full' | 'half' | 'empty'
  size: number
  color?: string
}) {
  if (fill === 'full') {
    return (
      <span style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
        <Star size={size} className={color} fill="currentColor" strokeWidth={0} />
      </span>
    )
  }

  if (fill === 'half') {
    return (
      <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
        {/* grey empty star underneath */}
        <Star size={size} className="text-zinc-600" fill="none" strokeWidth={1.5} />
        {/* yellow filled star clipped to left half */}
        <span style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: '100%', overflow: 'hidden', display: 'flex' }}>
          <Star size={size} className={color} fill="currentColor" strokeWidth={0} style={{ flexShrink: 0 }} />
        </span>
      </span>
    )
  }

  // empty
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <Star size={size} className="text-zinc-600" fill="none" strokeWidth={1.5} />
    </span>
  )
}

interface Props {
  rating: number
  size?: number
  color?: string
}

export default function StarDisplay({ rating, size = 12, color = 'text-[#F5A623]' }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <StarIcon
          key={s}
          fill={rating >= s ? 'full' : rating >= s - 0.5 ? 'half' : 'empty'}
          size={size}
          color={color}
        />
      ))}
    </div>
  )
}
