'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { ConteoIdioma, IdiomaApp } from '@/app/api/admin/idioma-app/route'
import { Bloque, Cifra, numero } from '@/app/admin/_components/AppMedicionPanel'

/**
 * "Idioma de la app": cuántas instalaciones la usan en castellano y cuántas en
 * inglés, en los últimos 30 días. Los datos y de dónde sale cada número están
 * en `/api/admin/idioma-app`.
 */

const pctDe = (n: number, de: number) =>
  de > 0 ? `${(Math.round((n / de) * 1000) / 10).toLocaleString('es-AR')}%` : '—'

function Detalle({ c, conDato }: { c: ConteoIdioma; conDato: number }) {
  return (
    <>
      {pctDe(c.total, conDato)} de las que tienen dato
      {c.cuenta > 0 && <> · {numero(c.cuenta)} por la cuenta</>}
    </>
  )
}

export function IdiomaAppPanel({ recarga }: { recarga: number }) {
  const [datos, setDatos] = useState<IdiomaApp | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/admin/idioma-app', { cache: 'no-store' })
      .then(async res => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.message ?? `Error ${res.status}`)
        if (vivo) { setDatos(json as IdiomaApp); setError(null) }
      })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar') })
    return () => { vivo = false }
  }, [recarga])

  if (error) {
    return (
      <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 text-sm text-red-300 flex items-center gap-2">
        <AlertTriangle size={15} /> Idioma de la app: {error}
      </div>
    )
  }
  if (!datos) {
    return (
      <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 text-sm text-[#A0A0B0] flex items-center gap-2">
        <Loader2 size={15} className="animate-spin" /> Cargando el idioma de la app…
      </div>
    )
  }

  const conDato = datos.es.total + datos.en.total

  return (
    <Bloque
      titulo="Idioma de la app"
      subtitulo={
        <>
          {numero(datos.instalaciones)} instalaciones abrieron la app en los últimos 30 días. Cuenta el último
          idioma de cada una; las versiones que todavía no lo mandan usan el de la cuenta, si tiene sesión
          {datos.desde
            ? <> · la app lo manda desde el {new Date(datos.desde).toLocaleDateString('es-AR')}</>
            : <> · ninguna instalación lo mandó todavía</>}
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Cifra label="Castellano" valor={numero(datos.es.total)} detalle={<Detalle c={datos.es} conDato={conDato} />} />
        <Cifra label="Inglés" valor={numero(datos.en.total)} detalle={<Detalle c={datos.en} conDato={conDato} />} />
        <Cifra
          label="Sin dato"
          valor={numero(datos.sinDato)}
          detalle={<>{pctDe(datos.sinDato, datos.instalaciones)} del total · versión vieja y sin sesión</>}
        />
      </div>
      {(datos.cambios.aEs > 0 || datos.cambios.aEn > 0) && (
        <p className="text-[11px] text-zinc-500 mt-3">
          Elegidos en Ajustes en estos 30 días: {numero(datos.cambios.aEn)} a inglés, {numero(datos.cambios.aEs)} a castellano.
        </p>
      )}
    </Bloque>
  )
}
