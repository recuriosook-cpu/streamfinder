'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { track, registrarAlta } from '@/lib/analytics'
import PlatformPicker, { PlatformLogo } from '@/components/PlatformPicker'
import { useCountry } from '@/context/CountryContext'
import {
  ONBOARDING_GENRES,
  MIN_GENRES,
  TASTE_TO_CONTINUE,
  TASTE_RATING,
  LIKED_FROM,
  keyOf,
  normalizeSavedPlatforms,
  getTasteGrid,
  getFirstRecommendations,
  type TasteItem,
  type FirstRecommendation,
} from '@/lib/onboarding'
import type { User } from '@supabase/supabase-js'

/**
 * Onboarding de cuenta nueva: tres pasos y una pantalla de cierre, igual que
 * el de la app (`src/screens/OnboardingScreen.tsx` de glynbox-mobile).
 *
 *   1. Plataformas  → `profiles.favorite_platforms`
 *   2. Géneros      → `profiles.favorite_genres`
 *   3. Gusto        → cada póster tocado es una calificación de
 *                     `TASTE_RATING` estrellas en `ratings` (y "la vi" en
 *                     `watched`)
 *   → Tus primeras recomendaciones, con el onboarding ya guardado
 *
 * Salteable desde cualquier paso. Cada paso guarda al avanzar: quien cierra la
 * pestaña en el paso 2 no pierde las plataformas.
 */

const TOTAL_STEPS = 3

/**
 * Va en todos los eventos del flujo, junto a `paso`. Es lo que separa en el
 * panel este flujo del de cinco pasos que mandaba la web hasta ahora.
 */
const FLUJO = 'corto'

const RECS_PATH = '/onboarding/recomendaciones'

const COPY: { title: string; subtitle: string }[] = [
  {
    title: '¿Dónde ves series y películas?',
    subtitle: 'Marcá tus plataformas y te decimos dónde está cada título.',
  },
  {
    title: '¿Qué te gusta ver?',
    subtitle: 'Elegí tus géneros. Podés cambiarlos cuando quieras.',
  },
  {
    title: 'Tocá las que viste y te gustaron',
    subtitle: `Con ${TASTE_TO_CONTINUE} ya podemos recomendarte. Cuantas más, mejor.`,
  },
]

const poster = (path: string | null, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null)

/** Lo que ya tenía de cada título de la grilla. */
type Mark = { rating: number | null; watched: boolean }

function Spinner({ dark = false, size = 20 }: { dark?: boolean; size?: number }) {
  return (
    <span
      className={`inline-block rounded-full border-2 animate-spin ${dark ? 'border-black/30 border-t-black' : 'border-[#FFFD02] border-t-transparent'}`}
      style={{ width: size, height: size }}
    />
  )
}

// ── Paso 1: plataformas ───────────────────────────────────────────────────────

// La grilla está en components/PlatformPicker.tsx: la usa también Ajustes.

// ── Paso 2: géneros ───────────────────────────────────────────────────────────

function GenresStep({ selected, onToggle }: { selected: string[]; onToggle: (name: string) => void }) {
  const ok = selected.length >= MIN_GENRES
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ONBOARDING_GENRES.map(g => {
          const active = selected.includes(g.name)
          return (
            <button
              key={g.id}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => onToggle(g.name)}
              className="flex items-center gap-1 px-3.5 py-2 rounded-full text-sm border transition-colors"
              style={{
                borderColor: active ? '#FFFD02' : '#2A2A3A',
                backgroundColor: active ? 'rgba(255,253,2,0.15)' : 'transparent',
                color: active ? '#fff' : '#A0A0B0',
                fontWeight: active ? 600 : 400,
              }}
            >
              {active && <Check size={13} className="text-[#FFFD02]" />}
              {g.name}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-center mt-5" style={{ color: ok ? '#22C55E' : '#A0A0B0' }}>
        {ok
          ? `✓ Elegiste ${selected.length} ${selected.length === 1 ? 'género' : 'géneros'}`
          : 'Elegí al menos uno'}
      </p>
    </div>
  )
}

// ── Paso 3: la grilla de gusto ────────────────────────────────────────────────

function TasteGridStep({
  items, loading, selected, blocked, onToggle,
}: {
  items: TasteItem[]
  loading: boolean
  selected: Set<string>
  /** Todavía se lee lo que ya tenía calificado: el primer toque escribiría sin saberlo. */
  blocked: boolean
  onToggle: (item: TasteItem) => void
}) {
  if (loading && items.length === 0) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }
  if (items.length === 0) {
    return <p className="text-sm text-[#A0A0B0] text-center py-8">No pudimos cargar títulos. Podés seguir sin marcar nada.</p>
  }

  const done = selected.size >= TASTE_TO_CONTINUE
  return (
    <div>
      <p
        className="text-sm font-semibold mb-3 tabular-nums"
        style={{ color: done ? '#22C55E' : '#fff' }}
        aria-live="polite"
      >
        {done ? `✓ ${selected.size} marcadas` : `${Math.min(selected.size, TASTE_TO_CONTINUE)} de ${TASTE_TO_CONTINUE}`}
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {items.map(item => {
          const key = keyOf(item)
          const active = selected.has(key)
          const src = poster(item.posterPath)
          return (
            <button
              key={key}
              type="button"
              role="checkbox"
              aria-checked={active}
              aria-label={`${item.title}${item.type === 'tv' ? ', serie' : ''}`}
              disabled={blocked}
              onClick={() => onToggle(item)}
              className="relative aspect-[2/3] rounded-[10px] overflow-hidden border-2 bg-[#1C1C27] transition-transform active:scale-95 disabled:opacity-50"
              style={{ borderColor: active ? '#FFFD02' : 'transparent' }}
            >
              {src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover transition-opacity"
                  style={{ opacity: active ? 0.55 : 1 }}
                />
              )}
              {active && (
                <span className="absolute top-1.5 right-1.5 w-[26px] h-[26px] rounded-full bg-[#FFFD02] flex items-center justify-center">
                  <Heart size={14} className="text-[#0A0A0F]" fill="currentColor" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Cierre: tus primeras recomendaciones ──────────────────────────────────────

function FirstRecommendations({
  items, loading, hasPlatforms, finishing, onOpen, onFinish,
}: {
  items: FirstRecommendation[]
  loading: boolean
  hasPlatforms: boolean
  finishing: boolean
  onOpen: () => void
  onFinish: () => void
}) {
  const subtitle = hasPlatforms
    ? 'Parecidas a las que marcaste, y están en tus plataformas.'
    : (
      <>
        Parecidas a las que marcaste.{' '}
        <Link href="/ajustes/plataformas" className="text-[#FFFD02] hover:underline">
          Elegí tus plataformas en Ajustes
        </Link>{' '}
        y te decimos dónde verlas.
      </>
    )

  return (
    <>
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 pb-6">
        <h1 className="text-2xl font-black text-white mt-6">Tus primeras recomendaciones</h1>
        <p className="text-sm text-[#A0A0B0] leading-5 mt-1.5">{subtitle}</p>
        <div className="h-5" />

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Spinner />
            <p className="text-xs text-[#A0A0B0]">Buscando títulos para vos…</p>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-[#A0A0B0] text-center py-8">
            {hasPlatforms
              ? 'No encontramos títulos parecidos en tus plataformas todavía. En el inicio vas a tener más.'
              : 'No pudimos armar recomendaciones ahora. En el inicio vas a tener más.'}
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-2.5 gap-y-3">
            {items.map(item => {
              const src = poster(item.posterPath)
              return (
                <Link
                  key={keyOf(item)}
                  href={`/${item.type}/${item.id}`}
                  onClick={e => { if (finishing) e.preventDefault(); else onOpen() }}
                  aria-label={item.platform ? `${item.title}, en ${item.platform.name}` : item.title}
                  className="block transition-transform active:scale-95"
                >
                  <div className="relative aspect-[2/3] rounded-[10px] overflow-hidden bg-[#1C1C27]">
                    {src && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                    )}
                    {item.platform && (
                      <span className="absolute left-1.5 bottom-1.5 shadow-lg">
                        <PlatformLogo platform={item.platform} size={22} />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white leading-4 mt-1.5 line-clamp-2 h-8">{item.title}</p>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      <BottomBar>
        <button
          type="button"
          onClick={onFinish}
          disabled={finishing}
          className="w-full py-3.5 rounded-full bg-[#FFFD02] hover:bg-[#E5EB00] text-[#0A0A0F] font-bold text-[15px] transition-colors disabled:opacity-40 flex items-center justify-center"
        >
          {finishing ? <Spinner dark /> : 'Ir al inicio'}
        </button>
      </BottomBar>
    </>
  )
}

/** El botón principal, pegado abajo: en el celular queda siempre a mano del pulgar. */
function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-20 w-full border-t border-[#2A2A3A] bg-[#0A0A0F]/95 backdrop-blur"
      style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-2xl mx-auto px-4 pt-3">{children}</div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = useRef(createClient()).current
  const { country } = useCountry()

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [platforms, setPlatforms] = useState<number[]>([])
  const [genres, setGenres] = useState<string[]>([])

  // Paso 3. `itemsFor` dice con qué géneros se pidió la grilla.
  const [items, setItems] = useState<TasteItem[]>([])
  const [itemsFor, setItemsFor] = useState<string | null>(null)
  const [loadingItems, setLoadingItems] = useState(false)
  const [marks, setMarks] = useState<Map<string, Mark>>(new Map())
  const [marksFor, setMarksFor] = useState<string | null>(null)

  // Saltar
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [skipping, setSkipping] = useState(false)

  // Cierre
  const [showingRecs, setShowingRecs] = useState(false)
  const [recs, setRecs] = useState<FirstRecommendation[]>([])
  const [loadingRecs, setLoadingRecs] = useState(false)
  const [leaving, setLeaving] = useState(false)

  /**
   * Los que marcó en esta pasada, en orden, y si "la vi" lo prendió el toque.
   * Sacar el toque borra la nota y, si la vio recién acá, también el "la vi".
   * Lo que ya tenía calificado de antes no se toca nunca desde esta pantalla.
   */
  const tappedHere = useRef(new Map<string, { item: TasteItem; watchedByTap: boolean }>())

  // signup_completed sale de `registrarAlta`, en el init de abajo. Acá sólo se
  // limpia el `?nuevo=1` que puede mandar /auth/callback.
  const [nuevoEnUrl] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('nuevo') === '1'
  )
  useEffect(() => {
    if (!nuevoEnUrl) return
    const params = new URLSearchParams(window.location.search)
    params.delete('nuevo')
    params.delete('metodo')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }, [nuevoEnUrl])

  // Auth guard + precarga
  useEffect(() => {
    async function init() {
      const force = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('force') === 'true'

      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user ?? null
      if (!u) { router.replace('/auth'); return }

      // Antes de cualquier redirección: el alta es de la cuenta, no de que
      // haga el onboarding. Ver `registrarAlta` en lib/analytics.ts.
      registrarAlta(u, nuevoEnUrl)

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed_at, onboarding_skipped, favorite_genres, favorite_platforms')
        .eq('id', u.id)
        .maybeSingle()

      if (!force) {
        if (profile?.onboarding_completed_at != null || profile?.onboarding_skipped === true) {
          router.replace('/')
          return
        }
      }

      // Los que rehacen el onboarding desde Ajustes arrancan con lo de antes.
      // Max puede venir con el id viejo (384): pasa al de hoy.
      setGenres((profile?.favorite_genres as string[] | null) ?? [])
      setPlatforms(normalizeSavedPlatforms(profile?.favorite_platforms as string[] | null))

      setUser(u)
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Un `onboarding_step_viewed` por paso mostrado.
  useEffect(() => {
    if (loading || showingRecs) return
    track('onboarding_step_viewed', { paso: step, flujo: FLUJO })
  }, [step, loading, showingRecs])

  // La pantalla de cierre no es una ruta, pero se mide como una, igual que en la app.
  useEffect(() => {
    if (showingRecs) track('page_view', { path: RECS_PATH }, { path: RECS_PATH })
  }, [showingRecs])

  // Cada paso arranca arriba.
  useEffect(() => { window.scrollTo(0, 0) }, [step, showingRecs])

  // La grilla se pide al llegar al paso 3, con los géneros de ese momento. Si
  // vuelve atrás y los cambia, se pide de nuevo.
  const genresKey = genres.join('|')
  useEffect(() => {
    if (step !== 3 || itemsFor === genresKey) return
    let alive = true
    setLoadingItems(true)
    getTasteGrid(genres)
      .then(list => { if (alive) { setItems(list); setItemsFor(genresKey) } })
      .catch(err => {
        console.warn('[onboarding] grilla:', err)
        // Se da por pedida igual: la grilla vacía deja seguir.
        if (alive) setItemsFor(genresKey)
      })
      .finally(() => { if (alive) setLoadingItems(false) })
    return () => { alive = false }
  }, [genres, genresKey, itemsFor, step])

  // Lo que ya tenía calificado o visto de los títulos de la grilla.
  const itemsKey = items.map(keyOf).join(',')
  useEffect(() => {
    if (!user || items.length === 0 || marksFor === itemsKey) return
    let alive = true
    const ids = [...new Set(items.map(i => i.id))]
    Promise.all([
      supabase.from('ratings').select('media_id, media_type, rating').eq('user_id', user.id).in('media_id', ids),
      supabase.from('watched').select('media_id, media_type').eq('user_id', user.id).in('media_id', ids),
    ]).then(([ratingsRes, watchedRes]) => {
      if (!alive) return
      const next = new Map<string, Mark>()
      for (const r of ratingsRes.data ?? []) {
        const k = `${r.media_type}:${r.media_id}`
        next.set(k, { rating: Number(r.rating), watched: next.get(k)?.watched ?? false })
      }
      for (const w of watchedRes.data ?? []) {
        const k = `${w.media_type}:${w.media_id}`
        next.set(k, { rating: next.get(k)?.rating ?? null, watched: true })
      }
      setMarks(next)
      setMarksFor(itemsKey)
    })
    return () => { alive = false }
  }, [items, itemsKey, marksFor, supabase, user])

  const ratingOf = useCallback((item: TasteItem) => marks.get(keyOf(item))?.rating ?? null, [marks])

  /**
   * Lo que ya tenía calificado con nota baja no se ofrece: un toque le pisaría
   * la nota con un 4, y tampoco se puede mostrar como "le gustó".
   */
  const visibleItems = useMemo(
    () => items.filter(item => {
      const rating = ratingOf(item)
      return rating === null || rating >= LIKED_FROM
    }),
    [items, ratingOf]
  )

  /** Las que cuentan como marcadas: con nota positiva, de ahora o de antes. */
  const selected = useMemo(
    () => new Set(visibleItems.filter(item => ratingOf(item) !== null).map(keyOf)),
    [ratingOf, visibleItems]
  )

  const setMark = (key: string, mark: Mark) => setMarks(prev => new Map(prev).set(key, mark))

  const toggleItem = useCallback(async (item: TasteItem) => {
    if (!user) return
    const key = keyOf(item)
    const filter = { user_id: user.id, media_id: item.id, media_type: item.type }
    const current = marks.get(key) ?? { rating: null, watched: false }
    const tapped = tappedHere.current.get(key)

    if (tapped) {
      tappedHere.current.delete(key)
      const after = { rating: null, watched: tapped.watchedByTap ? false : current.watched }
      setMark(key, after)
      const writes = [supabase.from('ratings').delete().match(filter)]
      if (tapped.watchedByTap) writes.push(supabase.from('watched').delete().match(filter))
      const results = await Promise.all(writes)
      if (results.some(r => r.error)) {
        tappedHere.current.set(key, tapped)
        setMark(key, current)
        setError('No pudimos guardar. Probá de nuevo.')
      }
      return
    }

    // Calificado de antes: queda como está.
    if (current.rating !== null) return

    const watchedByTap = !current.watched
    tappedHere.current.set(key, { item, watchedByTap })
    setMark(key, { rating: TASTE_RATING, watched: true })

    const now = new Date().toISOString()
    const base = { ...filter, title: item.title, poster_path: item.posterPath }
    const writes = [
      supabase.from('ratings').upsert({ ...base, rating: TASTE_RATING, rated_at: now }, { onConflict: 'user_id,media_id,media_type' }),
    ]
    if (watchedByTap) {
      writes.push(supabase.from('watched').upsert({ ...base, watched_at: now }, { onConflict: 'user_id,media_id,media_type' }))
    }
    const results = await Promise.all(writes)
    if (results[0].error) {
      tappedHere.current.delete(key)
      setMark(key, current)
      setError('No pudimos guardar. Probá de nuevo.')
      return
    }
    // Después del guardado: una calificación que falló no es una calificación.
    track('media_rated', { media_type: item.type, media_id: item.id, valor: TASTE_RATING })
  }, [marks, supabase, user])

  /** Las recomendaciones salen de lo marcado: lo de antes primero, lo de ahora al final. */
  const loadRecs = useCallback(() => {
    const before = visibleItems.filter(item => selected.has(keyOf(item)) && !tappedHere.current.has(keyOf(item)))
    const now = [...tappedHere.current.values()].map(entry => entry.item)
    setLoadingRecs(true)
    getFirstRecommendations({ liked: [...before, ...now], platformIds: platforms, genreNames: genres, country })
      .then(setRecs)
      .catch(err => console.warn('[onboarding] recomendaciones:', err))
      .finally(() => setLoadingRecs(false))
  }, [country, genres, platforms, selected, visibleItems])

  const handleContinue = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      let res
      if (step === 1) {
        res = await supabase.from('profiles').update({ favorite_platforms: platforms.map(String) }).eq('id', user.id)
      } else if (step === 2) {
        res = await supabase.from('profiles').update({ favorite_genres: genres }).eq('id', user.id)
      } else {
        // El 3 ya guardó cada póster al tocarlo. El cierre se guarda antes de
        // mostrar las recomendaciones: si cierra la pestaña ahí, ya está hecho.
        res = await supabase.from('profiles').update({
          onboarding_completed: true,
          onboarding_skipped: false,
          onboarding_completed_at: new Date().toISOString(),
        }).eq('id', user.id)
      }
      if (res.error) throw new Error(res.error.message)

      // Después de guardar: un paso "completado" es uno cuyo guardado salió bien.
      track('onboarding_step_completed', { paso: step, flujo: FLUJO })

      if (step === TOTAL_STEPS) {
        document.cookie = 'new_user=; max-age=0; path=/'
        loadRecs()
        setShowingRecs(true)
      } else {
        setStep(s => s + 1)
      }
    } catch (err) {
      console.warn('[onboarding] guardar paso:', err)
      setError('No pudimos guardar este paso. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    if (!user || skipping) return
    setSkipping(true)
    // El paso en el que estaba parado es el dato: dice dónde se cansó.
    track('onboarding_skipped', { paso: step, tipo: 'boton_saltar', flujo: FLUJO })
    // Las dos columnas: sin `skipped`, el inicio lo vuelve a mandar acá.
    const { error: err } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true, onboarding_skipped: true })
      .eq('id', user.id)
    if (err) {
      setSkipping(false)
      setShowSkipConfirm(false)
      setError('No pudimos guardar. Probá de nuevo.')
      return
    }
    document.cookie = 'new_user=; max-age=0; path=/'
    localStorage.setItem('glynbox_welcome', '1')
    router.replace('/')
  }

  /** Sale al inicio. El onboarding ya quedó guardado al mostrar el cierre. */
  const leave = () => {
    setLeaving(true)
    localStorage.setItem('glynbox_welcome', '1')
    router.replace('/')
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#0A0A0F]">
        <Spinner size={32} />
      </div>
    )
  }

  if (showingRecs) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#0A0A0F]">
        <FirstRecommendations
          items={recs}
          loading={loadingRecs}
          hasPlatforms={platforms.length > 0}
          finishing={leaving}
          onOpen={() => setLeaving(true)}
          onFinish={leave}
        />
      </div>
    )
  }

  const gridLoading = loadingItems || itemsFor !== genresKey
  const tasteReady =
    selected.size >= TASTE_TO_CONTINUE ||
    // Sin títulos para marcar, o con todos marcados, no se lo deja encerrado.
    (!gridLoading && visibleItems.length === 0) ||
    (visibleItems.length > 0 && selected.size >= visibleItems.length)

  const canContinue = step === 1 ? true : step === 2 ? genres.length >= MIN_GENRES : tasteReady

  const continueLabel =
    step === TOTAL_STEPS ? 'Ver mis recomendaciones'
    : step === 1 && platforms.length === 0 ? 'No tengo ninguna'
    : 'Siguiente'

  const copy = COPY[step - 1]
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value])

  return (
    <div className="min-h-dvh flex flex-col bg-[#0A0A0F]">

      {showSkipConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-2">¿Saltear la configuración?</h3>
            <p className="text-[#A0A0B0] text-sm mb-6">
              Podés hacerla después desde Ajustes. Las recomendaciones van a ser más genéricas hasta entonces.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowSkipConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#2A2A3A] text-zinc-300 hover:text-white transition-colors text-sm"
              >
                Seguir configurando
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={skipping}
                className="flex-1 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {skipping && <Spinner size={14} />}
                Saltear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progreso, atrás y saltar */}
      <header className="w-full max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="w-14">
            {step > 1 && (
              <button
                type="button"
                onClick={() => { setError(null); setStep(s => s - 1) }}
                className="text-sm text-[#A0A0B0] hover:text-white transition-colors"
                aria-label="Volver al paso anterior"
              >
                Atrás
              </button>
            )}
          </div>
          <p className="flex-1 text-center text-xs text-[#A0A0B0]">Paso {step} de {TOTAL_STEPS}</p>
          {/* Saltar está desde el primer paso. Chico y sin color a propósito:
              tiene que encontrarse, no invitar. */}
          <div className="w-14 text-right">
            <button
              type="button"
              onClick={() => setShowSkipConfirm(true)}
              className="text-xs text-[#A0A0B0] hover:text-zinc-300 transition-colors"
              aria-label="Saltar el onboarding"
            >
              Saltar
            </button>
          </div>
        </div>
        <div className="h-1 mt-3 rounded-full overflow-hidden bg-[#1C1C27]">
          <div
            className="h-full rounded-full bg-[#FFFD02] transition-all duration-500 ease-out"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 pb-6">
        <h1 className="text-2xl font-black text-white mt-6">{copy.title}</h1>
        <p className="text-sm text-[#A0A0B0] leading-5 mt-1.5">{copy.subtitle}</p>
        <div className="h-5" />

        {step === 1 && <PlatformPicker selected={platforms} onToggle={id => setPlatforms(prev => toggle(prev, id))} />}
        {step === 2 && <GenresStep selected={genres} onToggle={name => setGenres(prev => toggle(prev, name))} />}
        {step === 3 && (
          <TasteGridStep
            items={visibleItems}
            loading={gridLoading}
            selected={selected}
            blocked={marksFor !== itemsKey}
            onToggle={item => { setError(null); void toggleItem(item) }}
          />
        )}
      </main>

      <BottomBar>
        {error && <p className="text-xs text-red-400 text-center mb-2" role="alert">{error}</p>}
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue || saving}
          className="w-full py-3.5 rounded-full bg-[#FFFD02] hover:bg-[#E5EB00] text-[#0A0A0F] font-bold text-[15px] transition-colors disabled:opacity-40 disabled:hover:bg-[#FFFD02] flex items-center justify-center"
        >
          {saving ? <Spinner dark /> : continueLabel}
        </button>
      </BottomBar>
    </div>
  )
}
