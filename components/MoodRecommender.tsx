'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useCountry } from '@/context/CountryContext'
import type { User } from '@supabase/supabase-js'

// ── Step data ─────────────────────────────────────────────────────────────────

const MOODS = [
  { key: 'laugh',  emoji: '😂', label: 'Para reírme',      sub: 'Comedia · Humor' },
  { key: 'cry',    emoji: '🥺', label: 'Para emocionarme', sub: 'Drama · Historia' },
  { key: 'scare',  emoji: '😱', label: 'Para asustarme',   sub: 'Terror · Suspenso' },
  { key: 'think',  emoji: '🤯', label: 'Para pensar',      sub: 'Sci-fi · Thriller' },
  { key: 'action', emoji: '⚡', label: 'Adrenalina',       sub: 'Acción · Aventura' },
  { key: 'calm',   emoji: '☁️', label: 'Algo tranquilo',   sub: 'Romance · Documental' },
]

const DURATIONS = [
  { key: 'short',      emoji: '⏱',  label: 'Menos de 1h30', sub: 'Algo rápido' },
  { key: 'medium',     emoji: '🕑',  label: '1h30 a 2h30',   sub: 'Una peli normal' },
  { key: 'long',       emoji: '🕒',  label: 'Más de 2h30',   sub: 'Algo épico' },
  { key: 'series',     emoji: '📺',  label: 'Una serie',     sub: 'Varios episodios' },
  { key: 'miniseries', emoji: '🎬',  label: 'Miniserie',     sub: 'Historia completa' },
  { key: 'any',        emoji: '🎯',  label: 'Lo que sea',    sub: 'Sin restricción' },
]

const COMPANIES = [
  { key: 'solo',    emoji: '🙋',      label: 'Solo/a',      sub: 'A mi ritmo' },
  { key: 'couple',  emoji: '👫',      label: 'En pareja',   sub: 'Algo para dos' },
  { key: 'family',  emoji: '👨‍👩‍👧',  label: 'En familia',  sub: 'Apto para todos' },
  { key: 'friends', emoji: '👥',      label: 'Con amigos',  sub: 'Para el grupo' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface Recommendation {
  title: string
  year: number
  reason: string
  platform: string
  duration: string
  tmdb_id: number
  media_type: 'movie' | 'tv'
  poster_path: string | null
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map(n => (
        <div key={n} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full transition-all duration-400"
              style={{ backgroundColor: step >= n ? '#FFFD02' : '#52525b' }}
            />
            <span
              className="text-xs font-medium transition-colors duration-300"
              style={{ color: step >= n ? '#FFFD02' : '#71717a' }}
            >
              Paso {n}
            </span>
          </div>
          {n < 3 && (
            <div
              className="w-10 h-px transition-all duration-400"
              style={{ backgroundColor: step > n ? '#FFFD02' : '#3f3f46' }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function OptionCard({
  emoji,
  label,
  sub,
  selected,
  onClick,
}: {
  emoji: string
  label: string
  sub: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 py-5 px-3 rounded-2xl border-2 transition-all duration-200 cursor-pointer text-center"
      style={{
        backgroundColor: selected ? 'rgba(255,253,2,0.08)' : 'rgba(28,28,39,0.8)',
        borderColor: selected ? '#FFFD02' : '#3f3f46',
      }}
    >
      <span className="text-4xl leading-none select-none">{emoji}</span>
      <span className="text-white font-semibold text-sm leading-tight">{label}</span>
      <span className="text-[#A0A0B0] text-xs">{sub}</span>
    </button>
  )
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3 bg-[#1C1C27]/60 rounded-2xl p-3 animate-pulse">
          <div className="w-20 shrink-0 aspect-[2/3] bg-zinc-700 rounded-xl" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 bg-zinc-700 rounded w-3/4" />
            <div className="h-3 bg-zinc-700 rounded w-1/3" />
            <div className="h-3 bg-zinc-700 rounded w-full" />
            <div className="h-3 bg-zinc-700 rounded w-5/6" />
            <div className="h-3 bg-zinc-700 rounded w-4/6 mt-1" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ResultCard({ rec }: { rec: Recommendation }) {
  const href = `/${rec.media_type === 'movie' ? 'movie' : 'tv'}/${rec.tmdb_id}`
  return (
    <div className="flex gap-3 bg-[#1C1C27]/70 border border-[#2A2A3A]/50 rounded-2xl p-3 hover:border-zinc-600 transition-colors">
      <div className="w-20 shrink-0 aspect-[2/3] relative rounded-xl overflow-hidden bg-zinc-700">
        {rec.poster_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w185${rec.poster_path}`}
            alt={rec.title}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#A0A0B0] text-xs text-center px-1">
            Sin imagen
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white text-sm leading-tight line-clamp-2">
          {rec.title}{' '}
          <span className="text-[#A0A0B0] font-normal">({rec.year})</span>
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300 font-medium">
            {rec.platform}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
            {rec.duration}
          </span>
        </div>
        <p className="text-xs text-[#A0A0B0] mt-2 line-clamp-3 leading-relaxed">{rec.reason}</p>
        <Link
          href={href}
          className="inline-block mt-2.5 text-xs font-semibold px-3 py-1 rounded-full transition-colors"
          style={{ backgroundColor: 'rgba(255,253,2,0.15)', color: '#FFFD02' }}
        >
          Ver detalles →
        </Link>
      </div>
    </div>
  )
}

function AuthModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-7 max-w-sm w-full text-center shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-4xl mb-3">🎬</div>
        <h3 className="text-lg font-bold text-white mb-2">
          Iniciá sesión para usar el recomendador
        </h3>
        <p className="text-[#A0A0B0] text-sm mb-6">
          Personalizamos las sugerencias según lo que ya viste y tus gustos.
        </p>
        <Link
          href="/auth"
          className="block w-full py-3 rounded-xl font-bold text-sm text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#FFFD02' }}
        >
          Iniciar sesión
        </Link>
        <button
          onClick={onClose}
          className="mt-3 text-[#A0A0B0] text-sm hover:text-zinc-300 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MoodRecommender() {
  const { country } = useCountry()
  const [user, setUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  const [step, setStep] = useState(1)
  const [moodKey, setMoodKey] = useState('')
  const [durationKey, setDurationKey] = useState('')
  const [companyKey, setCompanyKey] = useState('')

  const [loading, setLoading] = useState(false)
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setAuthChecked(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchRecommendations(selectedCompany: string) {
    setLoading(true)
    setRecommendations(null)
    try {
      const res = await fetch('/api/mood-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moodKey, durationKey, companyKey: selectedCompany, userId: user!.id, country }),
      })
      const data = await res.json()
      setRecommendations(data.recommendations ?? [])
    } catch {
      setRecommendations([])
    } finally {
      setLoading(false)
    }
  }

  function selectOption(key: string, setter: (v: string) => void, onAdvance: (key: string) => void) {
    if (!user) { setShowAuthModal(true); return }
    setter(key)
    setTimeout(() => onAdvance(key), 300)
  }

  function reset() {
    setStep(1); setMoodKey(''); setDurationKey(''); setCompanyKey('')
    setRecommendations(null); setLoading(false)
  }

  const isGuest = authChecked && !user

  const stepTitle = ['¿Cómo te sentís hoy?', '¿Cuánto tiempo tenés?', '¿Con quién vas a ver?']
  const currentTitle = stepTitle[step - 1] ?? ''

  return (
    <div className="relative w-full" style={{ background: 'linear-gradient(160deg, #111113 0%, #0d0d0f 50%, #111113 100%)' }}>

      {/* Subtle decorative glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 opacity-20 pointer-events-none blur-3xl"
        style={{ background: 'radial-gradient(ellipse, #FFFD02 0%, transparent 70%)' }}
      />

      {/* Guest overlay */}
      {isGuest && (
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          style={{ background: 'rgba(5,5,7,0.6)', backdropFilter: 'blur(1px)' }}
          onClick={() => setShowAuthModal(true)}
        />
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      <div className="relative max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-7">
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Recomendador por estado de ánimo
          </h2>
          <p className="text-[#A0A0B0] text-sm mt-2">
            Respondé 3 preguntas y te decimos exactamente qué ver hoy
          </p>
        </div>

        {/* Progress */}
        {!recommendations && !loading && <ProgressBar step={step} />}

        {/* Step question + options */}
        {!loading && !recommendations && (
          <>
            <p className="text-center text-zinc-200 font-semibold text-base mb-4">{currentTitle}</p>

            {/* Step 1 — Mood */}
            {step === 1 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {MOODS.map(m => (
                  <OptionCard
                    key={m.key}
                    emoji={m.emoji}
                    label={m.label}
                    sub={m.sub}
                    selected={moodKey === m.key}
                    onClick={() => selectOption(m.key, setMoodKey, () => setStep(2))}
                  />
                ))}
              </div>
            )}

            {/* Step 2 — Duration */}
            {step === 2 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {DURATIONS.map(d => (
                  <OptionCard
                    key={d.key}
                    emoji={d.emoji}
                    label={d.label}
                    sub={d.sub}
                    selected={durationKey === d.key}
                    onClick={() => selectOption(d.key, setDurationKey, () => setStep(3))}
                  />
                ))}
              </div>
            )}

            {/* Step 3 — Company */}
            {step === 3 && (
              <div className="grid grid-cols-2 gap-3">
                {COMPANIES.map(c => (
                  <OptionCard
                    key={c.key}
                    emoji={c.emoji}
                    label={c.label}
                    sub={c.sub}
                    selected={companyKey === c.key}
                    onClick={() => selectOption(c.key, setCompanyKey, fetchRecommendations)}
                  />
                ))}
              </div>
            )}

            {/* Back link */}
            {step > 1 && (
              <div className="mt-5">
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="text-[#A0A0B0] text-sm hover:text-zinc-300 transition-colors"
                >
                  ← Volver
                </button>
              </div>
            )}
          </>
        )}

        {/* Loading */}
        {loading && (
          <div>
            <p className="text-center text-[#A0A0B0] text-sm mt-2 mb-1">
              Buscando lo mejor para vos…
            </p>
            <SkeletonCards />
          </div>
        )}

        {/* Results */}
        {!loading && recommendations && (
          <div>
            <p className="text-center text-white font-semibold text-base mb-4">
              Estas son tus recomendaciones 🎬
            </p>
            {recommendations.length === 0 ? (
              <p className="text-center text-[#A0A0B0] text-sm py-6">
                No se pudieron obtener recomendaciones. Intentá de nuevo.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {recommendations.map((rec, i) => (
                  <ResultCard key={i} rec={rec} />
                ))}
              </div>
            )}
            <div className="text-center mt-6">
              <button
                onClick={reset}
                className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white border border-zinc-600 hover:border-zinc-400 hover:bg-[#1C1C27] transition-all"
              >
                Buscar de nuevo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
