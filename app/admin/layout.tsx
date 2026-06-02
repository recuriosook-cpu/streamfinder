import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import AdminSidebar from './_components/AdminSidebar'

export const metadata = { title: 'Admin — Glynbox', robots: { index: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* server component */ }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url, display_name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.username !== 'Ferlageok') redirect('/')

  return (
    <div className="flex min-h-screen bg-[#0A0A0F]">
      <AdminSidebar
        username={profile.username}
        avatarUrl={profile.avatar_url}
        displayName={profile.display_name}
      />
      <div className="flex-1 lg:ml-64 min-h-screen overflow-x-hidden">
        {children}
      </div>
    </div>
  )
}
