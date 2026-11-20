'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

/**
 * Cartel chico, abajo, para bajar la app. Sale en la ficha de película cuando
 * llega con `?sugerir_app=1`: lo pone "Ver ficha" de la ruleta cuando intentó
 * abrir la app y no estaba instalada (`app/ruleta/abrir-ficha.ts`).
 *
 * No es el aviso de pantalla completa (`AvisoAppGate`, que no sale en las
 * fichas): éste no tapa la película. Sale UNA vez por navegador
 * (localStorage), y el parámetro se saca de la URL para que no quede en un
 * link copiado ni vuelva al recargar.
 */

const CLAVE = 'glynbox-sugerir-app-visto'
// `src` es la marca de campaña que lee `/descargar` y viaja a las tiendas.
const DESTINO = '/descargar?src=ruleta'

// Decidido una vez por ficha: al sacar el parámetro de la URL no tiene que
// cambiar de opinión, pero en otra ficha se vuelve a mirar.
let decidido: { ruta: string; mostrar: boolean } | null = null

function mostrarAhora(): boolean {
  const ruta = window.location.pathname
  if (decidido?.ruta === ruta) return decidido.mostrar
  let mostrar = new URLSearchParams(window.location.search).get('sugerir_app') === '1'
  if (mostrar) {
    try { mostrar = localStorage.getItem(CLAVE) !== '1' } catch { /* sin storage: se muestra */ }
  }
  decidido = { ruta, mostrar }
  return mostrar
}

const sinCambios = () => () => {}

export default function SugerirApp() {
  const mostrar = useSyncExternalStore(sinCambios, mostrarAhora, () => false)
  const [cerrado, setCerrado] = useState(false)

  useEffect(() => {
    if (!mostrar) return
    try { localStorage.setItem(CLAVE, '1') } catch { /* sin storage */ }
    const url = new URL(window.location.href)
    if (url.searchParams.has('sugerir_app')) {
      url.searchParams.delete('sugerir_app')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    }
    return () => { decidido = null }
  }, [mostrar])

  if (!mostrar || cerrado) return null

  return (
    <div role="complementary" aria-label="Bajar la app de Glynbox"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center gap-3 rounded-2xl border border-[#2A2A3A] bg-[#13131A]/95 backdrop-blur px-3 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={40} height={40} className="w-10 h-10 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white leading-tight">Glynbox es mejor en la app</p>
          <p className="text-xs text-[#A0A0B0] leading-snug">Guardá tus pelis y recibí avisos.</p>
        </div>
        <Link href={DESTINO} prefetch={false}
          className="shrink-0 h-9 px-3.5 rounded-full bg-[#FFFD02] text-[#0A0A0F] text-sm font-semibold flex items-center">
          Descargar
        </Link>
        <button type="button" onClick={() => { setCerrado(true); if (decidido) decidido.mostrar = false }} aria-label="Cerrar"
          className="shrink-0 -mr-1 w-8 h-8 flex items-center justify-center rounded-full text-[#A0A0B0] hover:text-white hover:bg-white/10">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
