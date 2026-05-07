import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser, buildPushPayload } from '@/lib/send-push-notification'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB_BASE = 'https://api.themoviedb.org/3'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function todayMMDD(): string {
  const d = new Date()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function todayStart(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

function thirtyDaysAgo(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 30)
  return d.toISOString().split('T')[0]  // YYYY-MM-DD
}

// ── Auth guard ─────────────────────────────────────────────────────────────

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

// ── Supabase admin client ──────────────────────────────────────────────────

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── TMDB helpers ───────────────────────────────────────────────────────────

interface TmdbMovie {
  id: number
  title: string
  release_date: string
  poster_path: string | null
}

async function fetchActorMovies(actorId: number): Promise<TmdbMovie[]> {
  try {
    const url = `${TMDB_BASE}/person/${actorId}/movie_credits?api_key=${TMDB_KEY}&language=es-AR`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return (data.cast ?? []) as TmdbMovie[]
  } catch { return [] }
}

// ── Notification helpers ───────────────────────────────────────────────────

async function checkPref(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  prefKey: string
): Promise<boolean> {
  const { data } = await admin
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .maybeSingle()
  if (!data) return true
  const prefs = (data as { notification_preferences: Record<string, boolean> | null })
    .notification_preferences ?? {}
  return prefs[prefKey] !== false
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminClient()
  const mmdd  = todayMMDD()
  const today = todayStart()
  const cutoff = thirtyDaysAgo()

  const summary = { birthday: 0, new_release: 0, errors: [] as string[] }

  // ══════════════════════════════════════════════════════════════
  // A) ACTOR_BIRTHDAY
  // ══════════════════════════════════════════════════════════════

  // Find all followed_actors whose birthday matches today's MM-DD
  const { data: birthdayRows, error: bdErr } = await admin
    .from('followed_actors')
    .select('user_id, actor_id, actor_name')
    // birthday stored as 'YYYY-MM-DD'; extract MM-DD using LIKE '%MM-DD'
    .like('birthday', `%-${mmdd}`)

  if (bdErr) {
    summary.errors.push(`birthday fetch: ${bdErr.message}`)
  } else {
    for (const row of birthdayRows ?? []) {
      const { user_id, actor_id, actor_name } = row as {
        user_id: string; actor_id: number; actor_name: string
      }

      // Dedup: skip if already notified today for this actor
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', user_id)
        .eq('type', 'actor_birthday')
        .eq('entity_id', String(actor_id))
        .gte('created_at', today)
        .maybeSingle()
      if (existing) continue

      // Check preference
      if (!(await checkPref(admin, user_id, 'actor_birthday'))) continue

      const { error } = await admin.from('notifications').insert({
        user_id,
        type:         'actor_birthday',
        entity_id:    String(actor_id),
        entity_type:  'person',
        entity_title: actor_name,
        read:         false,
      })
      if (error) { summary.errors.push(`birthday insert ${actor_id}: ${error.message}`); continue }
      summary.birthday++
      // Push notification (fire-and-forget)
      const bdPush = buildPushPayload('actor_birthday', undefined, actor_name, String(actor_id))
      if (bdPush) sendPushToUser(user_id, bdPush).catch(() => {})
    }
  }

  // ══════════════════════════════════════════════════════════════
  // B) NEW_RELEASE
  // ══════════════════════════════════════════════════════════════

  // Get all unique actor_ids across all users
  const { data: allFollows, error: followErr } = await admin
    .from('followed_actors')
    .select('user_id, actor_id, actor_name')

  if (followErr) {
    summary.errors.push(`follows fetch: ${followErr.message}`)
  } else {
    // Group by actor_id → [user_ids]
    type FollowRow = { user_id: string; actor_id: number; actor_name: string }
    const actorMap = new Map<number, { actorName: string; userIds: string[] }>()
    for (const f of (allFollows ?? []) as FollowRow[]) {
      if (!actorMap.has(f.actor_id)) {
        actorMap.set(f.actor_id, { actorName: f.actor_name, userIds: [] })
      }
      actorMap.get(f.actor_id)!.userIds.push(f.user_id)
    }

    for (const [actorId, { actorName, userIds }] of actorMap) {
      await sleep(250) // throttle TMDB calls

      const movies = await fetchActorMovies(actorId)
      // Movies released in the last 30 days
      const recent = movies.filter(
        m => m.release_date && m.release_date >= cutoff && m.release_date <= new Date().toISOString().split('T')[0]
      )
      if (recent.length === 0) continue

      for (const movie of recent) {
        for (const userId of userIds) {
          // Dedup: one notification per user per movie (ever)
          const { data: existing } = await admin
            .from('notifications')
            .select('id')
            .eq('user_id', userId)
            .eq('type', 'new_release')
            .eq('entity_id', String(movie.id))
            .maybeSingle()
          if (existing) continue

          // Check preference
          if (!(await checkPref(admin, userId, 'new_release'))) continue

          const entityTitle = `Nueva de ${actorName}: ${movie.title}`
          const { error } = await admin.from('notifications').insert({
            user_id:      userId,
            type:         'new_release',
            entity_id:    String(movie.id),
            entity_type:  'movie',
            entity_title: entityTitle,
            read:         false,
          })
          if (error) { summary.errors.push(`new_release ${movie.id}: ${error.message}`); continue }
          summary.new_release++
          // Push notification (fire-and-forget)
          const nrPush = buildPushPayload('new_release', undefined, entityTitle, String(movie.id))
          if (nrPush) sendPushToUser(userId, nrPush).catch(() => {})
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    date: new Date().toISOString(),
    ...summary,
  })
}
