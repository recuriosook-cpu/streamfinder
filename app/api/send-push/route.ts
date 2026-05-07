import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendPushToUser, buildPushPayload } from '@/lib/send-push-notification'
import type { NotifType } from '@/lib/notify'

export async function POST(req: Request) {
  // Require authenticated session to prevent abuse
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list) {
          list.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch { /* ignore */ }
          })
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { userId, type, actorName, entityTitle, entityId } = body as {
    userId:       string
    type:         NotifType
    actorName?:   string
    entityTitle?: string
    entityId?:    string
  }

  if (!userId || !type) {
    return NextResponse.json({ error: 'Missing userId or type' }, { status: 400 })
  }

  const pushPayload = buildPushPayload(type, actorName, entityTitle, entityId)
  if (!pushPayload) {
    console.warn('[send-push] no payload for type:', type)
    return NextResponse.json({ ok: true, skipped: 'unknown type' })
  }

  await sendPushToUser(userId, pushPayload)

  return NextResponse.json({ ok: true })
}
