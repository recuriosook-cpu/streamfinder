import { Star } from 'lucide-react'

// Exported so interactive components (RatingStars, ReviewsSection) can reuse it
export function StarIcon({
  fill,
  size,
  color = 'text-yellow-400',
}: {
  fill: 'full' | 'half' | 'empty'
  size: number
  color?: string
}) {
  if (fill === 'full') {
    return <Star size={size} className={color} fill="currentColor" strokeWidth={0} />
  }
  if (fill === 'half') {
    return (
      <span className="relative inline-flex" style={{ width: size, height: size }}>
        <Star size={size} className="text-zinc-600" fill="none" strokeWidth={1.5} />
        <span
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: '50%' }}
        >
          <Star size={size} className={color} fill="currentColor" strokeWidth={0} />
        </span>
      </span>
    )
  }
  return <Star size={size} className="text-zinc-600" fill="none" strokeWidth={1.5} />
}

interface Props {
  rating: number
  size?: number
  color?: string
}

export default function StarDisplay({ rating, size = 12, color = 'text-yellow-400' }: Props) {
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
