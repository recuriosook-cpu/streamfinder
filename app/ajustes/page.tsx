'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User, Lock, Shield, Globe, Bell, Download, Upload,
  FileText, HelpCircle, LogOut, Trash2, ChevronRight, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useCountry } from '@/context/CountryContext'
import { COUNTRIES } from '@/lib/countries'

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="px-1 mb-1 text-[11px] font-semibold text-[#A0A0B0] uppercase tracking-widest">
      {label}
    </p>
  )
}

function ComingSoonBadge() {
  return (
    <span className="text-[10px] font-medium bg-[#2A2A3A] text-[#A0A0B0] px-2 py-0.5 rounded-full shrink-0">
      Próximamente
    </span>
  )
}

function SettingsRow({
  icon,
  label,
  value,
  onClick,
  href,
  danger,
  comingSoon,
}: {
  icon: React.ReactNode
  label: string
  value?: string
  onClick?: () => void
  href?: string
  danger?: boolean
  comingSoon?: boolean
}) {
  if (comingSoon) {
    return (
      <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl opacity-60 cursor-not-allowed text-zinc-300">
        <span className="shrink-0 text-[#A0A0B0]">{icon}</span>
        <span className="flex-1 text-sm font-medium">{label}</span>
        <ComingSoonBadge />
      </div>
    )
  }

  const inner = (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors cursor-pointer ${
        danger
          ? 'hover:bg-red-950/30 text-red-400 hover:text-red-300'
          : 'hover:bg-[#1C1C27] text-zinc-300 hover:text-white'
      }`}
    >
      <span className={`shrink-0 ${danger ? 'text-red-400' : 'text-[#A0A0B0]'}`}>{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {value && <span className="text-xs text-[#A0A0B0] mr-1">{value}</span>}
      {!value && <ChevronRight size={14} className="text-[#A0A0B0] shrink-0" />}
    </div>
  )

  if (href) return <Link href={href}>{inner}</Link>
  return <button className="w-full text-left" onClick={onClick}>{inner}</button>
}

export default function AjustesPage() {
  const router = useRouter()
  const supabase = createClient()
  const { country, countryData, setCountry } = useCountry()

  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  const [showCountryModal, setShowCountryModal] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      supabase.from('profiles').select('username').eq('id', data.user.id).maybeSingle()
        .then(({ data: p }) => { setUsername(p?.username ?? null); setLoading(false) })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/delete-account', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Error ${res.status}`)
      setDeleteSuccess(true)
      setTimeout(async () => {
        await supabase.auth.signOut()
        router.push('/')
      }, 2000)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Error desconocido')
      setDeleteLoading(false)
    }
  }

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="max-w-lg mx-auto px-4 py-8">

        {/* Header */}
        <h1 className="text-2xl font-bold text-white mb-8">Ajustes</h1>

        <div className="space-y-6">

          {/* CUENTA */}
          <div>
            <SectionHeader label="Cuenta" />
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl overflow-hidden divide-y divide-[#2A2A3A]/50">
              <SettingsRow
                icon={<User size={16} />}
                label="Editar perfil"
                href={username ? `/usuario/${username}` : '/profile'}
              />
              <SettingsRow
                icon={<Lock size={16} />}
                label="Cambiar contraseña"
                comingSoon
              />
              <SettingsRow
                icon={<Shield size={16} />}
                label="Privacidad"
                comingSoon
              />
            </div>
          </div>

          {/* PREFERENCIAS */}
          <div>
            <SectionHeader label="Preferencias" />
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl overflow-hidden divide-y divide-[#2A2A3A]/50">
              <SettingsRow
                icon={<Globe size={16} />}
                label="País"
                value={countryData.name}
                onClick={() => { setShowCountryModal(true); setCountrySearch('') }}
              />
              <SettingsRow
                icon={<Bell size={16} />}
                label="Notificaciones"
                comingSoon
              />
            </div>
          </div>

          {/* DATOS */}
          <div>
            <SectionHeader label="Datos" />
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl overflow-hidden divide-y divide-[#2A2A3A]/50">
              <SettingsRow
                icon={<Download size={16} />}
                label="Importar desde Letterboxd"
                href="/importar"
              />
              <SettingsRow
                icon={<Upload size={16} />}
                label="Exportar mis datos"
                comingSoon
              />
            </div>
          </div>

          {/* INFORMACIÓN */}
          <div>
            <SectionHeader label="Información" />
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl overflow-hidden divide-y divide-[#2A2A3A]/50">
              <SettingsRow icon={<FileText size={16} />} label="Política de privacidad" href="/privacidad" />
              <SettingsRow icon={<FileText size={16} />} label="Términos y condiciones" href="/terminos" />
              <SettingsRow icon={<HelpCircle size={16} />} label="Soporte" href="/soporte" />
              <div className="flex items-center gap-3 px-4 py-3.5 text-zinc-500">
                <span className="shrink-0"><FileText size={16} /></span>
                <span className="flex-1 text-sm">Versión</span>
                <span className="text-xs text-[#A0A0B0]">Glynbox v1.0.0</span>
              </div>
            </div>
          </div>

          {/* ZONA DE PELIGRO */}
          <div>
            <SectionHeader label="Zona de peligro" />
            <div className="bg-[#13131A] border border-red-900/40 rounded-2xl overflow-hidden divide-y divide-red-900/20">
              <SettingsRow
                icon={<LogOut size={16} />}
                label="Cerrar sesión"
                onClick={handleSignOut}
                danger
              />
              <SettingsRow
                icon={<Trash2 size={16} />}
                label="Eliminar cuenta"
                onClick={() => { setShowDeleteModal(true); setDeleteConfirm(''); setDeleteError(null); setDeleteSuccess(false) }}
                danger
              />
            </div>
          </div>

        </div>
      </div>

      {/* Country selector modal */}
      {showCountryModal && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowCountryModal(false) }}
        >
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A3A]">
              <p className="text-sm font-semibold text-white">Seleccioná tu país</p>
              <button onClick={() => setShowCountryModal(false)} className="text-[#A0A0B0] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-3 border-b border-[#2A2A3A]">
              <input
                value={countrySearch}
                onChange={e => setCountrySearch(e.target.value)}
                placeholder="Buscar país..."
                autoFocus
                className="w-full bg-[#1C1C27] text-white text-sm rounded-lg px-3 py-2 outline-none placeholder-zinc-500 focus:ring-1 focus:ring-[#FFFD02]"
              />
            </div>
            <div className="overflow-y-auto max-h-72">
              {filteredCountries.length === 0 ? (
                <p className="text-[#A0A0B0] text-sm text-center py-6">Sin resultados</p>
              ) : (
                filteredCountries.map(c => (
                  <button
                    key={c.code}
                    onClick={() => { setCountry(c.code); setShowCountryModal(false) }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                      c.code === country ? 'bg-[#FFFD02]/10 text-[#FFF84D]' : 'text-zinc-300 hover:bg-[#1C1C27] hover:text-white'
                    }`}
                  >
                    <span className="text-base">{c.code === country ? '✓' : ' '}</span>
                    <span>{c.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Placeholder subpages modal (Próximamente) */}
      {/* Delete account modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget && !deleteLoading) setShowDeleteModal(false) }}
        >
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A3A]">
              <p className="text-sm font-semibold text-red-400">¿Eliminar tu cuenta?</p>
              {!deleteLoading && (
                <button onClick={() => setShowDeleteModal(false)} className="text-[#A0A0B0] hover:text-white transition-colors">
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="px-5 py-5 space-y-4">
              {deleteSuccess ? (
                <div className="text-center py-4">
                  <p className="text-green-400 font-semibold text-sm">Cuenta eliminada</p>
                  <p className="text-[#A0A0B0] text-xs mt-1">Redirigiendo...</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    Esta acción <strong className="text-white">NO se puede deshacer</strong>. Se eliminarán permanentemente:
                    tu perfil, reseñas, comentarios, listas, películas vistas, watchlist, favoritos, calificaciones, seguidos,
                    seguidores y notificaciones.
                  </p>

                  <div>
                    <label className="text-xs text-[#A0A0B0] mb-1.5 block">
                      Para confirmar, escribí <strong className="text-white font-mono">ELIMINAR</strong>
                    </label>
                    <input
                      value={deleteConfirm}
                      onChange={e => setDeleteConfirm(e.target.value)}
                      placeholder="ELIMINAR"
                      disabled={deleteLoading}
                      className="w-full bg-[#1C1C27] border border-[#2A2A3A] text-white text-sm rounded-lg px-3 py-2.5 outline-none placeholder-zinc-600 focus:ring-1 focus:ring-red-500 font-mono disabled:opacity-50"
                    />
                  </div>

                  {deleteError && (
                    <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                      {deleteError}
                    </p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setShowDeleteModal(false)}
                      disabled={deleteLoading}
                      className="flex-1 py-2.5 rounded-lg border border-[#2A2A3A] text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirm !== 'ELIMINAR' || deleteLoading}
                      className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-sm text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {deleteLoading ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Eliminando...</>
                      ) : (
                        'Eliminar definitivamente'
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
