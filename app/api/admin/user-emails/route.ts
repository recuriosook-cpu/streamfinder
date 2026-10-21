import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'

async function getAdminUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options) } catch { /**/ } }) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  if (profile?.username !== 'Ferlageok') return null
  return user
}

const POR_PAGINA = 1000

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin: adminClient, failure } = requireAdminClient('admin/user-emails')
  if (failure) return failure

  // De a páginas de 1000, que es el tope de la API: con una sola página, desde
  // el usuario 1001 los emails faltaban sin ningún aviso.
  const emailMap: Record<string, string> = {}
  for (let page = 1; ; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: POR_PAGINA })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const u of data.users) {
      if (u.email) emailMap[u.id] = u.email
    }
    if (data.users.length < POR_PAGINA) break
  }

  return NextResponse.json({ emails: emailMap })
}
