'use client'

import { Check, Circle } from 'lucide-react'

/**
 * "Completá tu perfil" en el perfil propio: foto, nombre visible y bio, por
 * qué conviene y el premio (20 puntos una vez, los da la base:
 * supabase-perfil-completo-2026-10.sql). Es la misma tarjeta que
 * `CompletarPerfilCard` de la app, que además da el logro "Perfil completo".
 */

export const PUNTOS_PERFIL_COMPLETO = 20

const lleno = (v: string | null | undefined) => (v ?? '').trim().length > 0

export function perfilCompleto(p: { avatar_url: string | null; display_name: string | null; bio: string | null }) {
  return lleno(p.avatar_url) && lleno(p.display_name) && lleno(p.bio)
}

interface Props {
  avatarUrl: string | null
  displayName: string | null
  bio: string | null
  onCompletar: () => void
}

export default function CompletarPerfil({ avatarUrl, displayName, bio, onCompletar }: Props) {
  const pasos = [
    { listo: lleno(avatarUrl), texto: 'Foto' },
    { listo: lleno(displayName), texto: 'Nombre visible' },
    { listo: lleno(bio), texto: 'Bio' },
  ]
  const hechos = pasos.filter(p => p.listo).length

  return (
    <section className="rounded-2xl border border-[#2A2A3A] bg-[#13131A] p-4">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold text-white">Completá tu perfil</p>
        <p className="text-xs font-bold text-[#FFFD02]">{hechos} de 3</p>
      </div>
      <div className="mt-3 flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < hechos ? 'bg-[#FFFD02]' : 'bg-[#2A2A3A]'}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {pasos.map(p => (
          <span key={p.texto} className={`inline-flex items-center gap-1 text-xs ${p.listo ? 'text-white' : 'text-[#A0A0B0]'}`}>
            {p.listo ? <Check size={13} className="text-[#FFFD02]" /> : <Circle size={12} />}
            {p.texto}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[#A0A0B0]">
        Con foto aparecés en &quot;Gente con tu gusto&quot; y es más fácil que te sigan. Completalo y sumás{' '}
        {PUNTOS_PERFIL_COMPLETO} puntos.
      </p>
      <button
        type="button"
        onClick={onCompletar}
        className="mt-3 rounded-full bg-[#FFFD02] px-4 py-2 text-sm font-bold text-black hover:bg-[#E5EB00]"
      >
        Completar
      </button>
    </section>
  )
}
