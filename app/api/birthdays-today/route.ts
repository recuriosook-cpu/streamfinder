import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET() {
  const now     = new Date()
  const year    = now.getFullYear()
  const todayMD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('celebrity_birthdays')
    .select('tmdb_id, name, birthday, deathday, profile_path, popularity')
    .eq('birthday_md', todayMD)
    .order('popularity', { ascending: false })
    .limit(10)

  if (error || !data) {
    return NextResponse.json({ birthdays: [] })
  }

  const birthdays = data.map(row => {
    const birthYear = parseInt((row.birthday as string).slice(0, 4))
    const deceased  = !!row.deathday
    const age       = deceased
      ? parseInt((row.deathday as string).slice(0, 4)) - birthYear
      : year - birthYear

    return {
      id:          row.tmdb_id as number,
      name:        row.name    as string,
      profilePath: row.profile_path as string | null,
      age,
      popularity:  row.popularity as number,
      deceased,
    }
  })

  return NextResponse.json(
    { birthdays },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  )
}
