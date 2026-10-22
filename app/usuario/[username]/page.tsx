import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { itunesPara } from '@/lib/tiendas'
import { createServerClient } from '@/lib/supabase-server'
import { getAdminClient } from '@/lib/service-role'
import UserProfileClient from '@/components/UserProfileClient'
import Breadcrumb from '@/components/Breadcrumb'

interface Props {
  params: Promise<{ username: string }>
}

/**
 * El @ de hoy de alguien que antes se llamaba `username`, o `null`.
 *
 * Los @ que se cambian sin que la persona los elija (los aleatorios de Apple,
 * supabase-usuarios-apple-2026-10.sql) quedan en `usuarios_anteriores`, así un
 * link viejo compartido lleva al perfil en vez de a un 404. La tabla sólo la
 * lee el service role. Si no existe o falla, `null` y sigue el 404 de siempre.
 */
async function usuarioActual(username: string): Promise<string | null> {
  try {
    const admin = getAdminClient()
    const { data: anterior } = await admin
      .from('usuarios_anteriores')
      .select('user_id')
      // `ilike` para no depender de mayúsculas, con % y _ escapados.
      .ilike('username_viejo', username.replace(/[\\%_]/g, '\\$&'))
      .order('cambiado_en', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!anterior) return null
    const { data: perfil } = await admin
      .from('profiles')
      .select('username')
      .eq('id', anterior.user_id)
      .maybeSingle()
    return perfil?.username && perfil.username !== username ? perfil.username : null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const supabase = createServerClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, bio, avatar_url')
    .eq('username', username)
    .maybeSingle()

  const displayName = profile?.display_name ?? username
  const description = profile?.bio
    ? profile.bio.slice(0, 160)
    : `Perfil de ${displayName} en Glynbox — reseñas, listas y recomendaciones de películas y series.`
  const imageUrl = profile?.avatar_url ?? 'https://www.glynbox.com/logo.png'
  const title = `${displayName} (@${username}) — Glynbox`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url:    `https://www.glynbox.com/usuario/${username}`,
      images: [{ url: imageUrl, width: 400, height: 400, alt: displayName }],
    },
    twitter: {
      card:        'summary',
      title,
      description,
      images:      [imageUrl],
    },
    alternates: { canonical: `https://www.glynbox.com/usuario/${username}` },
    itunes: itunesPara(`/usuario/${encodeURIComponent(username)}`),
  }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params
  const supabase = createServerClient()

  // Sólo las columnas públicas: esta consulta va como visitante, y un visitante
  // no puede leer las demás (supabase-profiles-columnas-2026-09.sql). Con `*`
  // la consulta entera fallaría.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, instagram_username, tiktok_username, x_username, points, level')
    .eq('username', username)
    .maybeSingle()

  if (!profile) {
    const actual = await usuarioActual(username)
    if (actual) permanentRedirect(`/usuario/${encodeURIComponent(actual)}`)
    notFound()
  }

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-0">
        <Breadcrumb items={[{ label: profile.username ?? username }]} />
      </div>
      <UserProfileClient profile={profile} />
    </>
  )
}
