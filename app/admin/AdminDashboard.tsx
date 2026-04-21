'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Shield, Loader2, Users, AlertCircle } from 'lucide-react'

const ADMIN_EMAIL = 'hola@ferlage.com.ar'

interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  points: number | null
  level: number | null
  updated_at: string | null
}

export default function AdminDashboard() {
  const router   = useRouter()
  const supabase = useRef(createClient()).current

  const [checking,  setChecking]  = useState(true)
  const [loading,   setLoading]   = useState(true)
  const [profiles,  setProfiles]  = useState<Profile[]>([])
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email !== ADMIN_EMAIL) {
        router.replace('/')
        return
      }
      setChecking(false)
      loadProfiles()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProfiles() {
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .order('updated_at', { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      setProfiles(data ?? [])
    }
    setLoading(false)
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-emerald-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-20">

      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Shield size={16} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Panel de Administración</h1>
            <p className="text-xs text-zinc-500">Glynbox</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-8">

        {/* Total usuarios */}
        <div className="bg-gradient-to-r from-emerald-950/60 to-zinc-900 border border-emerald-800/40 rounded-2xl px-8 py-6 flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Users size={28} className="text-emerald-400" />
          </div>
          <div>
            {loading ? (
              <Loader2 size={24} className="animate-spin text-zinc-400" />
            ) : (
              <>
                <p className="text-5xl font-black text-white">{profiles.length}</p>
                <p className="text-emerald-400 font-semibold text-lg mt-0.5">usuarios registrados</p>
              </>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Error al cargar usuarios</p>
              <p className="text-xs text-red-400 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Lista de usuarios */}
        {!loading && !error && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Usuarios</h2>
              <span className="text-xs text-zinc-500">{profiles.length} en total</span>
            </div>

            {profiles.length === 0 ? (
              <p className="text-center text-zinc-500 text-sm py-12">No hay usuarios todavía</p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {profiles.map(u => (
                  <div key={u.id} className="px-5 py-4 flex items-start gap-4">

                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatar_url} alt={u.display_name ?? u.username ?? ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-500">
                          {(u.display_name ?? u.username ?? '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white">
                          {u.display_name ?? u.username ?? 'Sin nombre'}
                        </p>
                        {u.level != null && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                            Nv. {u.level}
                          </span>
                        )}
                      </div>
                      {u.username && (
                        <p className="text-xs text-zinc-500 mt-0.5">@{u.username}</p>
                      )}
                      {u.bio && (
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{u.bio}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {u.points != null && (
                          <span className="text-xs text-amber-400">{u.points} pts</span>
                        )}
                        {u.updated_at && (
                          <span className="text-xs text-zinc-600">
                            {new Date(u.updated_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-zinc-500" />
          </div>
        )}

      </div>
    </div>
  )
}
