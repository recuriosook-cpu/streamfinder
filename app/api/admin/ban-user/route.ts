import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'

const ADMIN_EMAIL = 'hola@ferlage.com.ar'

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch { /* ignore */ }
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let userId: string
  try {
    const body = await req.json()
    userId = body.userId
    if (!userId) throw new Error('missing userId')
  } catch {
    return NextResponse.json({ error: 'userId requerido' }, { status: 400 })
  }

  const { admin: supabaseAdmin, failure } = requireAdminClient('admin/ban-user')
  if (failure) return failure

  // Ban for ~100 years (effectively permanent, reversible from Supabase dashboard)
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: '876600h',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
