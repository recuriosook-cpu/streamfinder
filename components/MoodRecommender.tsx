'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useCountry } from '@/context/CountryContext'
import type { User } from '@supabase/supabase-js'

// ── Step data ─────────────────────────────────────────────────────────────────

const MOODS = [
  { id: 'reírme (comedia, humor)',        label: 'Para reírme',       sub: 'Comedia · Humor' },
  { id: 'emocionarme (drama, historia)',  label: 'Para emocionarme',  sub: 'Drama · Historia' },
  { id: 'asustarme (terror, suspenso)',   label: 'Para asustarme',    sub: 'Terror · Suspenso' },
  { id: 'pensar (sci-fi, thriller)',      label: 'Para pensar',       sub: 'Sci-fi · Thriller' },
  { id: 'adrenalina (acción, aventura)',  label: 'Adrenalina',        sub: 'Acción · Aventura' },
  { id: 'algo tranquilo (romance, documental)', label: 'Algo tranquilo', sub: 'Romance · Documental' },
]

const DURATIONS = [
  { id: 'menos de 1 hora y 30 minutos', label: 'Menos de 1h30' },
  { id: '1 hora 30 minutos a 2 horas 30 minutos', label: '1h30 a 2h30' },
  { id: 'más de 2 horas 30 minutos', label: 'Más de 2h30' },
  { id: 'una serie completa', label: 'Una serie' },
  { id: 'una miniserie', label: 'Miniserie' },
  { id: 'cualquier duración', label: 'Lo que sea' },
]

const COMPANIES = [
  { id: 'solo/a', label: 'Solo/a' },
  { id: 'en pareja', label: 'En pareja' },
  { id: 'en familia', label: 'En familia' },
  { id: 'con amigos', label: 'Con amigos' },
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

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-8">
      {[1, 2, 3].map(n => (
        <div key={n} className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full transition-all duration-300"
            style={{ backgroundColor: step >= n ? '#1DB954' : '#3f3f46' }}
          />
          {n < 3 && (
            <div
              className="w-12 h-0.5 transition-all duration-300"
              style={{ backgroundColor: step > n ? '#1DB954' : '#3f3f46' }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Skeleton cards ────────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3 bg-zinc-800 rounded-xl p-3 animate-pulse">
          <div className="w-20 shrink-0 aspect-[2/3] bg-zinc-700 rounded-lg" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 bg-zinc-700 rounded w-3/4" />
            <div className="h-3 bg-zinc-700 rounded w-1/3" />
            <div className="h-3 bg-zinc-700 rounded w-full" />
            <div className="h-3 bg-zinc-700 rounded w-5/6" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Result cards ──────────────────────────────────────────────────────────────

function ResultCard({ rec }: { rec: Recommendation }) {
  const href = `/${rec.media_type === 'movie' ? 'movie' : 'tv'}/${rec.tmdb_id}`
  return (
    <div className="flex gap-3 bg-zinc-800 rounded-xl p-3">
      <div className="w-20 shrink-0 aspect-[2/3] relative rounded-lg overflow-hidden bg-zinc-700">
        {rec.poster_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w185${rec.poster_path}`}
            alt={rec.title}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs text-center px-1">
            Sin imagen
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm leading-tight line-clamp-2">
          {rec.title} <span className="text-zinc-400 font-normal">({rec.year})</span>
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">{rec.platform}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">{rec.duration}</span>
        </div>
        <p className="text-xs text-zinc-400 mt-1.5 line-clamp-3">{rec.reason}</p>
        <Link
          href={href}
          className="inline-block mt-2 text-xs font-medium px-3 py-1 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
        >
          Ver detalles
        </Link>
      </div>
    </div>
  )
}

// ── Auth modal ────────────────────────────────────────────────────────────────

function AuthModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-3xl mb-3">🎬</div>
        <h3 className="text-lg font-bold text-white mb-2">Iniciá sesión para usar el recomendador</h3>
        <p className="text-zinc-400 text-sm mb-5">
          Personalizamos las sugerencias según lo que ya viste.
        </p>
        <Link
          href="/auth"
          className="block w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-colors"
          style={{ backgroundColor: '#1DB954' }}
        >
          Iniciar sesión
        </Link>
        <button
          onClick={onClose}
          className="mt-3 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
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
  const [mood, setMood] = useState('')
  const [duration, setDuration] = useState('')
  const [company, setCompany] = useState('')

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

  function handleOptionClick(cb: () => void) {
    if (!user) {
      setShowAuthModal(true)
      return
    }
    cb()
  }

  async function fetchRecommendations(selectedCompany: string) {
    setLoading(true)
    setRecommendations(null)
    try {
      const res = await fetch('/api/mood-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood,
          duration,
          company: selectedCompany,
          userId: user!.id,
          country,
        }),
      })
      const data = await res.json()
      setRecommendations(data.recommendations ?? [])
    } catch {
      setRecommendations([])
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setStep(1)
    setMood('')
    setDuration('')
    setCompany('')
    setRecommendations(null)
    setLoading(false)
  }

  const isGuest = authChecked && !user

  return (
    <div className="relative w-full bg-zinc-950">
      {/* Guest overlay */}
      {isGuest && (
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          style={{ background: 'rgba(9,9,11,0.55)' }}
          onClick={() => setShowAuthModal(true)}
        />
      )}

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-2">
          <h2 className="text-2xl font-bold text-white">¿Qué querés ver hoy?</h2>
          <p className="text-zinc-400 text-sm mt-1">Te recomendamos algo perfecto para este momento</p>
        </div>

        {/* Progress */}
        {!recommendations && !loading && (
          <div className="mt-6">
            <ProgressBar step={step} />
          </div>
        )}

        {/* Step 1 — Mood */}
        {!loading && !recommendations && step === 1 && (
          <div>
            <p className="text-center text-zinc-300 font-medium mb-4">¿Cómo te sentís hoy?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {MOODS.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleOptionClick(() => { setMood(m.id); setStep(2) })}
                  className="flex flex-col items-center justify-center gap-1 py-4 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 transition-all text-center group"
                >
                  <span className="text-white font-semibold text-sm group-hover:text-white">{m.label}</span>
                  <span className="text-zinc-500 text-xs">{m.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Duration */}
        {!loading && !recommendations && step === 2 && (
          <div>
            <p className="text-center text-zinc-300 font-medium mb-4">¿Cuánto tiempo tenés?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {DURATIONS.map(d => (
                <button
                  key={d.id}
                  onClick={() => handleOptionClick(() => { setDuration(d.id); setStep(3) })}
                  className="py-4 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 transition-all text-white font-semibold text-sm"
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(1)}
              className="mt-4 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
            >
              ← Volver
            </button>
          </div>
        )}

        {/* Step 3 — Company */}
        {!loading && !recommendations && step === 3 && (
          <div>
            <p className="text-center text-zinc-300 font-medium mb-4">¿Con quién vas a ver?</p>
            <div className="grid grid-cols-2 gap-3">
              {COMPANIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleOptionClick(() => {
                    setCompany(c.id)
                    fetchRecommendations(c.id)
                  })}
                  className="py-5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 transition-all text-white font-semibold text-sm"
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              className="mt-4 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
            >
              ← Volver
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div>
            <p className="text-center text-zinc-400 text-sm mt-6 mb-2">La IA está eligiendo lo mejor para vos…</p>
            <SkeletonCards />
          </div>
        )}

        {/* Results */}
        {!loading && recommendations && (
          <div>
            <p className="text-center text-zinc-300 font-medium mt-2 mb-4">
              Estas son tus recomendaciones 🎬
            </p>
            {recommendations.length === 0 ? (
              <p className="text-center text-zinc-500 text-sm">No se pudieron obtener recomendaciones. Intentá de nuevo.</p>
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
                className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white border border-zinc-600 hover:border-zinc-400 hover:bg-zinc-800 transition-all"
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
