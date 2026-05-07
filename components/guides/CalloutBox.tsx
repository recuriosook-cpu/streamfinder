import type { ReactNode } from 'react'

const STYLES = {
  tip:     { border: 'border-[#FFFD02]/30', bg: 'bg-[#FFFD02]/5',  icon: '💡', label: 'Tip',    text: 'text-[#FFFD02]'  },
  warning: { border: 'border-orange-500/30', bg: 'bg-orange-500/5', icon: '⚠️', label: 'Atención', text: 'text-orange-400' },
  note:    { border: 'border-blue-500/30',   bg: 'bg-blue-500/5',   icon: '📌', label: 'Nota',   text: 'text-blue-400'   },
  info:    { border: 'border-zinc-500/30',   bg: 'bg-zinc-500/5',   icon: 'ℹ️', label: 'Info',   text: 'text-zinc-300'   },
}

interface CalloutBoxProps {
  type?:     keyof typeof STYLES
  children?: ReactNode
}

export function CalloutBox({ type = 'note', children }: CalloutBoxProps) {
  const s = STYLES[type] ?? STYLES.note
  return (
    <div className={`my-6 rounded-xl border ${s.border} ${s.bg} px-5 py-4`}>
      <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 ${s.text}`}>
        <span>{s.icon}</span>
        <span>{s.label}</span>
      </div>
      <div className="text-sm text-zinc-300 leading-relaxed [&>p]:mb-0">{children}</div>
    </div>
  )
}
