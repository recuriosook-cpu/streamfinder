'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { X, Plus, Search, ArrowLeft, Tag, ArrowUp, ArrowDown } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { toast } from 'sonner'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

interface Item {
  media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null; position: number
}

interface SearchResult {
  id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null; year: string
}

function NuevaListaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get('edit')
  const supabase = useRef(createClient()).current

  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [tags,        setTags]        = useState<string[]>([])
  const [tagInput,    setTagInput]    = useState('')
  const [isPublic,    setIsPublic]    = useState(true)
  const [items,       setItems]       = useState<Item[]>([])
  const [saving,      setSaving]      = useState(false)
  const [userId,      setUserId]      = useState<string | null>(null)
  const [loading,     setLoading]     = useState(!!editId)

  const [query,          setQuery]          = useState('')
  const [searchResults,  setSearchResults]  = useState<SearchResult[]>([])
  const [searchLoading,  setSearchLoading]  = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/auth'); return }
      setUserId(data.user.id)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editId) return
    async function loadEdit() {
      const [listRes, itemsRes] = await Promise.all([
        supabase.from('lists').select('*').eq('id', editId).maybeSingle(),
        supabase.from('list_items').select('*').eq('list_id', editId).order('position'),
      ])
      if (listRes.data) {
        setTitle(listRes.data.title)
        setDescription(listRes.data.description ?? '')
        setTags(listRes.data.tags ?? [])
        setIsPublic(listRes.data.is_public)
      }
      if (itemsRes.data) {
        setItems(itemsRes.data.map((i: Item) => ({
          media_id: i.media_id, media_type: i.media_type as 'movie' | 'tv',
          title: i.title, poster_path: i.poster_path, position: i.position,
        })))
      }
      setLoading(false)
    }
    loadEdit()
  }, [editId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Movie/TV search
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (!query.trim()) { setSearchResults([]); return }
    debounce.current = setTimeout(async () => {
      if (!TMDB_KEY) return
      setSearchLoading(true)
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&language=es-AR&query=${encodeURIComponent(query)}&page=1`
        )
        const data = await res.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: SearchResult[] = (data.results ?? []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .slice(0, 8).map((r: any) => ({
            id: r.id, media_type: r.media_type,
            title: r.title ?? r.name ?? '',
            poster_path: r.poster_path,
            year: (r.release_date ?? r.first_air_date ?? '').slice(0, 4),
          }))
        setSearchResults(results)
      } catch { /* ignore */ }
      setSearchLoading(false)
    }, 300)
  }, [query])

  const addItem = (r: SearchResult) => {
    if (items.some(i => i.media_id === r.id && i.media_type === r.media_type)) return
    setItems(prev => [...prev, {
      media_id: r.id, media_type: r.media_type,
      title: r.title, poster_path: r.poster_path,
      position: prev.length,
    }])
    setQuery(''); setSearchResults([])
  }

  const removeItem = (idx: number) =>
    setItems(prev => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, position: i })))

  const moveItem = (idx: number, dir: 'up' | 'down') => {
    const newItems = [...items]
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= newItems.length) return
    ;[newItems[idx], newItems[target]] = [newItems[target], newItems[idx]]
    setItems(newItems.map((it, i) => ({ ...it, position: i })))
  }

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  const save = async () => {
    if (!title.trim() || !userId || saving) return
    setSaving(true)
    if (editId) {
      await supabase.from('lists').update({ title: title.trim(), description: description.trim() || null, tags, is_public: isPublic, updated_at: new Date().toISOString() }).eq('id', editId)
      await supabase.from('list_items').delete().eq('list_id', editId)
      if (items.length > 0) {
        await supabase.from('list_items').insert(items.map(it => ({ list_id: editId, ...it })))
      }
      toast.success('Lista actualizada')
      router.push(`/listas/${editId}`)
    } else {
      const { data } = await supabase.from('lists')
        .insert({ user_id: userId, title: title.trim(), description: description.trim() || null, tags, is_public: isPublic })
        .select('id').single()
      if (data && items.length > 0) {
        await supabase.from('list_items').insert(items.map(it => ({ list_id: data.id, ...it })))
      }
      toast.success('Lista creada')
      router.push(data ? `/listas/${data.id}` : '/listas')
    }
    setSaving(false)
  }

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-[#A0A0B0] hover:text-white mb-6 transition-colors text-sm">
        <ArrowLeft size={15} /> Volver
      </button>

      <h1 className="text-2xl font-bold text-white mb-8">{editId ? 'Editar lista' : 'Crear lista'}</h1>

      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider block mb-2">Título *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="El nombre de tu lista"
            className="w-full bg-[#13131A] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors" />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider block mb-2">Descripción</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="¿De qué trata esta lista?" rows={3}
            className="w-full bg-[#13131A] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-xl px-4 py-3 text-white text-sm outline-none resize-none transition-colors" />
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider block mb-2">Tags</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[#2A2A3A] text-[#A0A0B0]">
                <Tag size={10} />{tag}
                <button onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="text-zinc-600 hover:text-white transition-colors">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="Agregar tag (Enter para confirmar)"
              className="flex-1 bg-[#13131A] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors" />
            <button onClick={addTag} className="px-3 py-2 rounded-xl border border-[#2A2A3A] hover:border-[#FFFD02] text-[#A0A0B0] hover:text-white transition-all">
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Public */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPublic(v => !v)}
            className={`w-10 h-6 rounded-full transition-all relative ${isPublic ? 'bg-[#FFFD02]' : 'bg-[#1C1C27]'}`}>
            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${isPublic ? 'left-5' : 'left-1'}`} />
          </button>
          <span className="text-sm text-[#A0A0B0]">{isPublic ? 'Lista pública' : 'Lista privada'}</span>
        </div>

        {/* Search movies/series */}
        <div>
          <label className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider block mb-2">Agregar títulos</label>
          <div className="relative">
            <div className="flex items-center gap-2 bg-[#13131A] border border-[#2A2A3A] focus-within:border-[#FFFD02] rounded-xl px-4 py-3 transition-colors">
              <Search size={15} className="text-[#A0A0B0] shrink-0" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar película o serie..."
                className="bg-transparent text-sm text-white placeholder-zinc-600 outline-none flex-1" />
              {searchLoading && <div className="w-4 h-4 border-2 border-[#A0A0B0] border-t-transparent rounded-full animate-spin shrink-0" />}
            </div>

            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#13131A] border border-[#2A2A3A] rounded-xl shadow-2xl z-30 overflow-hidden">
                {searchResults.map(r => {
                  const already = items.some(i => i.media_id === r.id && i.media_type === r.media_type)
                  return (
                    <button key={`${r.media_type}-${r.id}`} onClick={() => addItem(r)} disabled={already}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#1C1C27]'}`}>
                      <div className="w-8 h-12 rounded overflow-hidden bg-zinc-700 shrink-0">
                        {r.poster_path && <Image src={`https://image.tmdb.org/t/p/w92${r.poster_path}`} alt={r.title} width={32} height={48} className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{r.title}</p>
                        <p className="text-xs text-[#A0A0B0]">{r.year} · {r.media_type === 'movie' ? 'Película' : 'Serie'}</p>
                      </div>
                      {already ? <span className="text-xs text-[#A0A0B0]">Agregada</span> : <Plus size={14} className="text-[#A0A0B0]" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Items list */}
        {items.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider mb-3">{items.length} {items.length === 1 ? 'título' : 'títulos'}</p>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div key={`${item.media_type}-${item.media_id}`}
                  className="flex items-center gap-3 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-3">
                  <div className="w-8 h-12 rounded overflow-hidden bg-zinc-700 shrink-0">
                    {item.poster_path && <Image src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title} width={32} height={48} className="w-full h-full object-cover" />}
                  </div>
                  <p className="flex-1 text-sm text-white truncate">{item.title}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0} className="p-1 text-[#A0A0B0] hover:text-white disabled:opacity-30 transition-colors">
                      <ArrowUp size={13} />
                    </button>
                    <button onClick={() => moveItem(idx, 'down')} disabled={idx === items.length - 1} className="p-1 text-[#A0A0B0] hover:text-white disabled:opacity-30 transition-colors">
                      <ArrowDown size={13} />
                    </button>
                    <button onClick={() => removeItem(idx)} className="p-1 text-[#A0A0B0] hover:text-red-400 transition-colors">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save */}
        <div className="flex gap-3 pt-2">
          <button onClick={() => router.back()} className="px-6 py-3 rounded-xl border border-[#2A2A3A] text-[#A0A0B0] hover:text-white text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={save} disabled={!title.trim() || saving}
            className="flex-1 py-3 rounded-xl bg-[#FFFD02] hover:bg-[#E5EB00] disabled:opacity-40 text-black text-sm font-semibold transition-colors">
            {saving
              ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> Guardando...</span>
              : editId ? 'Guardar cambios' : 'Crear lista'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NuevaListaPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <NuevaListaContent />
    </Suspense>
  )
}
