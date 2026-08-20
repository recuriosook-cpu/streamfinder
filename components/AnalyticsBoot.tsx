'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { track } from '@/lib/analytics'

/**
 * Dispara `app_open` una vez por carga de la app.
 *
 * Va montado en el layout raíz, así que corre en cualquier página.
 *
 * "Una vez por carga" y no "una vez por pantalla": con el router de Next,
 * navegar de / a /movie/123 no recarga nada, y contar eso como una apertura más
 * inflaría el número. El flag de módulo sobrevive a los re-renders y a los
 * cambios de ruta del lado del cliente, y se pierde recién con una recarga real
 * — que es exactamente cuando la app se abre de nuevo.
 */

let fired = false

export function AnalyticsBoot() {
  useEffect(() => {
    if (fired) return
    fired = true

    // `logueado` decide de qué lado del embudo cae la visita, así que hay que
    // esperar a saberlo en vez de asumir false y corregir después.
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        track('app_open', { logueado: !!data.session?.user })
      })
      .catch(() => {
        track('app_open', { logueado: false })
      })
  }, [])

  return null
}
