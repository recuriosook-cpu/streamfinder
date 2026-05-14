'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ListPlus, Check, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface UserList { id: string; title: string; hasItem: boolean }

interface Props {
  mediaId: number; mediaType: 'movie' | 'tv'
  title: string; posterPath: string | null
}

export default function AddToListButton({ mediaId, mediaType, title, posterPath }: Props) {
  const supabase = useRef(createClient()).current
  const router = useRouter()
  const [open,     setOpen]     = useState(false)
  const [lists,    setLists]    = useState<UserList[]>([])
  const [loading,  setLoading]  = useState(false)
  const [userId,   setUserId]   = useState<string | null>(null)
  const [busy,     setBusy]     = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function openModal() {
    if (!userId) { router.push('/auth'); return }
    setOpen(true)
    setLoading(true)
    const [listsRes, itemsRes] = await Promise.all([
      supabase.from('lists').select('id,title').eq('user_id', userId).order('updated_at', { ascending: false }),
      supabase.from('list_items').select('list_id').eq('media_id', mediaId).eq('media_type', mediaType),
    ])
    const inLists = new Set((itemsRes.data ?? []).map((i: { list_id: string }) => i.list_id))
    setLists((listsRes.data ?? []).map((l: { id: string; title: string }) => ({ id: l.id, title: l.title, hasItem: inLists.has(l.id) })))
    setLoading(false)
  }

  async function toggleList(listId: string, has: boolean) {
    if (busy) return
    setBusy(listId)
    if (has) {
      await supabase.from('list_items').delete()
        .eq('list_id', listId).eq('media_id', mediaId).eq('media_type', mediaType)
    } else {
      const position = await supabase.from('list_items').select('id', { count: 'exact', head: true }).eq('list_id', listId)
      await supabase.from('list_items').insert({
        list_id: listId, media_id: mediaId, media_type: mediaType,
        title, poster_path: posterPath, position: position.count ?? 0,
      })
      await supabase.from('lists').update({ updated_at: new Date().toISOString() }).eq('id', listId)
    }
    setLists(prev => prev.map(l => l.id === listId ? { ...l, hasItem: !has } : l))
    setBusy(null)
  }

  return (
    <div className="relative w-full sm:w-auto" ref={ref}>
      <button
        onClick={openModal}
        className="flex items-center justify-center sm:justify-start gap-2 px-4 py-2 rounded-lg font-medium transition-colors w-full sm:w-auto bg-zinc-700 hover:bg-zinc-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ListPlus size={18} />
        Agregar a lista
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-[#1C1C27] border border-[#2A2A3A] rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2A3A]">
            <p className="text-sm font-semibold text-white">Agregar a lista</p>
            <button onClick={() => setOpen(false)} className="text-[#A0A0B0] hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : lists.length === 0 ? (
              <p className="text-[#A0A0B0] text-sm text-center py-6">No tenés listas todavía.</p>
            ) : (
              lists.map(l => (
                <button key={l.id} onClick={() => toggleList(l.id, l.hasItem)} disabled={busy === l.id}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#13131A] transition-colors text-left">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${l.hasItem ? 'bg-[#FFFD02] border-[#FFFD02]' : 'border-[#2A2A3A]'}`}>
                    {l.hasItem && <Check size={12} className="text-black" />}
                  </div>
                  <span className="text-sm text-white truncate flex-1">{l.title}</span>
                </button>
              ))
            )}
          </div>

          <div className="px-4 py-3 border-t border-[#2A2A3A]">
            <Link href="/listas/nueva"
              className="flex items-center gap-2 text-sm text-[#A0A0B0] hover:text-[#FFFD02] transition-colors">
              <Plus size={14} /> Crear lista nueva
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
