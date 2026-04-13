'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Search, Heart, LogOut, LogIn, Menu, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
      setQuery('')
      setMenuOpen(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link href="/" className="text-xl font-bold text-emerald-400 shrink-0">
          StreamFinder
        </Link>

        <form onSubmit={handleSearch} className="flex-1 flex items-center bg-zinc-800 rounded-lg px-3 py-2 gap-2">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar películas y series..."
            className="bg-transparent text-sm outline-none text-white placeholder-zinc-500 flex-1 min-w-0"
          />
        </form>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <Link href="/favorites" className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
                <Heart size={16} />
                Favoritos
              </Link>
              <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
                <LogOut size={16} />
                Salir
              </button>
            </>
          ) : (
            <Link href="/auth" className="flex items-center gap-1.5 text-sm bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition-colors">
              <LogIn size={16} />
              Iniciar sesión
            </Link>
          )}
        </div>

        <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-zinc-900 border-t border-zinc-800 px-4 py-3 flex flex-col gap-3">
          {user ? (
            <>
              <Link href="/favorites" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-zinc-300">
                <Heart size={16} /> Favoritos
              </Link>
              <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-zinc-300 text-left">
                <LogOut size={16} /> Salir
              </button>
            </>
          ) : (
            <Link href="/auth" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-emerald-400">
              <LogIn size={16} /> Iniciar sesión
            </Link>
          )}
        </div>
      )}
    </nav>
  )
}
