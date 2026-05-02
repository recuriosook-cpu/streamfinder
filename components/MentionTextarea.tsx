'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Suggestion { username: string; avatar_url: string | null }

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  className?: string
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

export default function MentionTextarea({
  value, onChange, placeholder, rows = 4, className,
  textareaRef: externalRef, onKeyDown,
}: Props) {
  const supabase       = useRef(createClient()).current
  const internalRef    = useRef<HTMLTextAreaElement>(null)
  const ref            = externalRef ?? internalRef
  const [suggestions,  setSuggestions]  = useState<Suggestion[]>([])
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [selectedIdx,  setSelectedIdx]  = useState(0)

  useEffect(() => {
    if (mentionQuery === null || mentionQuery.length === 0) { setSuggestions([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .ilike('username', `${mentionQuery}%`)
        .limit(5)
      setSuggestions((data ?? []) as Suggestion[])
    }, 200)
    return () => clearTimeout(t)
  }, [mentionQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  function detectMention(val: string, cursor: number) {
    const before = val.slice(0, cursor)
    const match  = before.match(/@(\w*)$/)
    if (match) {
      setMentionStart(cursor - match[0].length)
      setMentionQuery(match[1])
      setSelectedIdx(0)
    } else {
      setMentionStart(null)
      setMentionQuery(null)
      setSuggestions([])
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    onChange(val)
    detectMention(val, e.target.selectionStart ?? val.length)
  }

  function selectSuggestion(username: string) {
    if (mentionStart === null) return
    const cursor  = ref.current?.selectionStart ?? value.length
    const before  = value.slice(0, mentionStart)
    const after   = value.slice(cursor)
    const newVal  = `${before}@${username} ${after}`
    onChange(newVal)
    setMentionStart(null); setMentionQuery(null); setSuggestions([])
    setTimeout(() => {
      if (ref.current) {
        const pos = before.length + username.length + 2
        ref.current.setSelectionRange(pos, pos)
        ref.current.focus()
      }
    }, 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown')  { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1)); return }
      if (e.key === 'ArrowUp')    { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Escape')     { setSuggestions([]); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && suggestions.length > 0)) {
        e.preventDefault()
        selectSuggestion(suggestions[selectedIdx]?.username ?? '')
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {suggestions.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1 z-50 bg-[#1C1C27] border border-[#2A2A3A] rounded-xl shadow-2xl overflow-hidden min-w-[200px]">
          {suggestions.map((s, i) => (
            <button
              key={s.username}
              type="button"
              onMouseDown={e => { e.preventDefault(); selectSuggestion(s.username) }}
              className={`flex items-center gap-2.5 px-3 py-2 w-full text-left transition-colors ${
                i === selectedIdx ? 'bg-zinc-700' : 'hover:bg-zinc-700/60'
              }`}
            >
              <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-600 shrink-0">
                {s.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.avatar_url} alt={s.username} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-[#2A2A3A] text-[#FFFD02]">
                    {s.username[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-sm text-white font-medium flex items-center gap-1">
                @{s.username}
                {(s.username === 'Ferlageok' || s.username === 'ferlageok') && <svg width="13" height="13" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="10" fill="#1D9BF0"/><path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
