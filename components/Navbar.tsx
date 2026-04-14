'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Search, Heart, LogOut, LogIn, Menu, X, UserCircle, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useCountry } from '@/context/CountryContext'
import { COUNTRIES } from '@/lib/countries'
import type { User } from '@supabase/supabase-js'

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [countryOpen, setCountryOpen] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')
  const countryRef = useRef<HTMLDivElement>(null)
  const countrySearchRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const { country, countryData, setCountry } = useCountry()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Close country dropdown when clicking outside
  useEffect(() => {
    if (!countryOpen) return
    const handler = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryOpen(false)
        setCountrySearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [countryOpen])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (countryOpen) {
      setTimeout(() => countrySearchRef.current?.focus(), 50)
    }
  }, [countryOpen])

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

  const handleSelectCountry = (code: string) => {
    setCountry(code)
    setCountryOpen(false)
    setCountrySearch('')
  }

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  )

  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
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

        {/* Country selector */}
        <div className="relative shrink-0" ref={countryRef}>
          <button
            onClick={() => setCountryOpen(v => !v)}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 hover:text-white px-3 py-2 rounded-lg transition-colors"
            title="Cambiar país"
          >
            <span className="text-base leading-none">{countryData.flag}</span>
            <span className="hidden sm:inline text-xs font-medium">{country}</span>
            <ChevronDown size={12} className={`transition-transform ${countryOpen ? 'rotate-180' : ''}`} />
          </button>

          {countryOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50">
              {/* Search */}
              <div className="p-2 border-b border-zinc-700">
                <input
                  ref={countrySearchRef}
                  value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                  placeholder="Buscar país..."
                  className="w-full bg-zinc-700 text-white text-sm rounded-lg px-3 py-1.5 outline-none placeholder-zinc-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              {/* List */}
              <div className="overflow-y-auto max-h-64">
                {filteredCountries.length === 0 ? (
                  <p className="text-zinc-500 text-sm text-center py-4">Sin resultados</p>
                ) : (
                  filteredCountries.map(c => (
                    <button
                      key={c.code}
                      onClick={() => handleSelectCountry(c.code)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                        c.code === country
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      <span className="text-base leading-none w-6 text-center">{c.flag}</span>
                      <span className="flex-1">{c.name}</span>
                      {c.code === country && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <Link href="/favorites" className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
                <Heart size={16} />
                Favoritos
              </Link>
              <Link href="/profile" className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
                <UserCircle size={16} />
                Mi perfil
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
              <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-zinc-300">
                <UserCircle size={16} /> Mi perfil
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
