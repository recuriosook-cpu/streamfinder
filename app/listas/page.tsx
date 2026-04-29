'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Search, Plus, Heart, Tag, Film } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface ListCard {
  id: string; title: string; description: string | null; tags: string[]
  created_at: string; user_id: string
  author: { username: string | null; display_name: string | null; avatar_url: string | null } | null
  likeCount: number
  previews: (string | null)[]
  itemCount: number
}

export const metadata = { title: 'Listas — Glynbox' }

export default function ListasPage() {
  const supabase = useRef(createClient()).current
  const [tab, setTab] = useState<'popular' | 'recent'>('popular')
  const [lists, setLists] = useState<ListCard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsLoggedIn(!!data.user))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadLists()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLists() {
    setLoading(true)
    const { data: rawLists } = await supabase
      .from('lists')
      .select('id, title, description, tags, created_at, user_id')
      .eq('is_public', true)
      .order(tab === 'recent' ? 'created_at' : 'created_at', { ascending: false })
      .limit(30)

    if (!rawLists?.length) { setLists([]); setLoading(false); return }

    const userIds = [...new Set(rawLists.map(l => l.user_id))]
    const listIds = rawLists.map(l => l.id)

    const [profilesRes, likesRes, itemsRes] = await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', userIds),
      supabase.from('list_likes').select('list_id').in('list_id', listIds),
      supabase.from('list_items').select('list_id,poster_path').in('list_id', listIds).order('position').limit(200),
    ])

    const profileMap = Object.fromEntries((profilesRes.data ?? []).map(p => [p.id, p]))
    const likesByList: Record<string, number> = {}
    for (const l of (likesRes.data ?? [])) likesByList[l.list_id] = (likesByList[l.list_id] ?? 0) + 1
    const itemsByList: Record<string, { poster_path: string | null }[]> = {}
    for (const i of (itemsRes.data ?? [])) {
      itemsByList[i.list_id] = itemsByList[i.list_id] ?? []
      itemsByList[i.list_id].push(i)
    }

    let cards: ListCard[] = rawLists.map(l => ({
      ...l,
      author: profileMap[l.user_id] ?? null,
      likeCount: likesByList[l.id] ?? 0,
      previews: (itemsByList[l.id] ?? []).slice(0, 4).map(i => i.poster_path),
      itemCount: (itemsByList[l.id] ?? []).length,
    }))

    if (tab === 'popular') cards = cards.sort((a, b) => b.likeCount - a.likeCount)
    setLists(cards)
    setLoading(false)
  }

  const filtered = search.trim()
    ? lists.filter(l =>
        l.title.toLowerCase().includes(search.toLowerCase()) ||
        l.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : lists

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Listas</h1>
        {isLoggedIn && (
          <Link href="/listas/nueva"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-black bg-[#FFFD02] hover:bg-[#E5EB00] transition-colors">
            <Plus size={16} /> Crear lista
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-[#13131A] border border-[#2A2A3A] rounded-xl px-4 py-3 mb-5">
        <Search size={16} className="text-[#A0A0B0] shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título o tag..."
          className="bg-transparent text-sm text-white placeholder-zinc-600 outline-none flex-1"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-1 w-fit">
        {(['popular', 'recent'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${tab === t ? 'bg-[#FFFD02] text-black' : 'text-[#A0A0B0] hover:text-white'}`}>
            {t === 'popular' ? '🔥 Populares' : '🕐 Recientes'}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 h-48" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-[#A0A0B0]">
          {search ? 'Sin resultados.' : 'No hay listas públicas todavía.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(l => (
            <Link key={l.id} href={`/listas/${l.id}`}
              className="group bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 hover:border-[#FFFD02]/50 transition-all block">
              {/* Poster previews */}
              <div className="flex gap-1 mb-3 h-[72px]">
                {l.previews.length > 0 ? l.previews.map((p, i) => (
                  <div key={i} className="flex-1 rounded-lg overflow-hidden bg-[#1C1C27]">
                    {p ? (
                      <Image src={`https://image.tmdb.org/t/p/w185${p}`} alt="" width={80} height={72}
                        className="w-full h-full object-cover" />
                    ) : <div className="w-full h-full bg-[#1C1C27]" />}
                  </div>
                )) : (
                  <div className="flex-1 rounded-lg bg-[#1C1C27] flex items-center justify-center">
                    <Film size={24} className="text-zinc-700" />
                  </div>
                )}
                {l.previews.length < 4 && Array.from({ length: 4 - l.previews.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="flex-1 rounded-lg bg-[#1C1C27]" />
                ))}
              </div>

              {/* Info */}
              <p className="font-semibold text-white group-hover:text-[#FFFD02] transition-colors line-clamp-1 mb-1">
                {l.title}
              </p>
              {l.description && (
                <p className="text-xs text-[#A0A0B0] line-clamp-2 mb-2 leading-relaxed">{l.description}</p>
              )}
              {l.tags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {l.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border border-[#2A2A3A] text-[#A0A0B0]">
                      <Tag size={8} />{tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-[#A0A0B0] mt-2">
                <span>{l.itemCount} {l.itemCount === 1 ? 'título' : 'títulos'}</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><Heart size={11} /> {l.likeCount}</span>
                  <span>@{l.author?.username ?? 'usuario'}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
