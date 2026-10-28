'use client'

import { useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * "Continuar con Google" con el botón oficial de Google Identity Services.
 *
 * Con `signInWithOAuth` el login pasaba por la dirección de Supabase y Google
 * mostraba "continuar a ddoqsdgiggkhbsulxncs.supabase.co", y la gente
 * desconfiaba. Acá Google le da el `credential` (un ID token) a la página
 * misma, que se lo pasa a Supabase con `signInWithIdToken`: la ventana de
 * Google dice "Glynbox" y glynbox.com, que es el origen autorizado del ID de
 * cliente web.
 *
 * Con la sesión ya iniciada sigue a `/auth/callback`, que sin `code` hace lo
 * mismo que después del login por redirección: crea el perfil si es nuevo y
 * manda al onboarding o al inicio.
 *
 * El nonce viaja dos veces, como en Apple: a Google el SHA-256 y a Supabase
 * el original.
 *
 * Si no está `NEXT_PUBLIC_GOOGLE_CLIENT_ID` o el script de Google no carga
 * (bloqueadores, navegadores de apps), muestra `fallback`, que es el botón de
 * siempre.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
const GSI_SRC = 'https://accounts.google.com/gsi/client'

type CredentialResponse = { credential?: string }

type GoogleId = {
  initialize: (config: {
    client_id: string
    callback: (response: CredentialResponse) => void
    nonce?: string
    ux_mode?: 'popup' | 'redirect'
    use_fedcm_for_button?: boolean
    itp_support?: boolean
  }) => void
  renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } }
  }
}

let gsiPromise: Promise<GoogleId> | null = null

function loadGsi(): Promise<GoogleId> {
  if (gsiPromise) return gsiPromise
  gsiPromise = new Promise<GoogleId>((resolve, reject) => {
    const ready = () => {
      const id = window.google?.accounts?.id
      if (id) resolve(id)
      else reject(new Error('gsi sin google.accounts.id'))
    }
    if (window.google?.accounts?.id) return ready()
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.onload = ready
    script.onerror = () => reject(new Error('gsi no cargó'))
    document.head.appendChild(script)
  })
  // Un fallo no queda cacheado: la próxima vez que se monte se reintenta.
  gsiPromise.catch(() => { gsiPromise = null })
  return gsiPromise
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

type Props = {
  supabase: SupabaseClient
  modo: 'login' | 'register'
  /** Eligió una cuenta en la ventana de Google: arranca el login. */
  onInicio: () => void
  onError: (motivo: 'sin_token' | 'supabase') => void
  /** El botón de siempre, para cuando el oficial no se puede mostrar. */
  fallback: React.ReactNode
}

export default function GoogleBotonOficial({ supabase, modo, onInicio, onError, fallback }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'sin_boton'>(CLIENT_ID ? 'cargando' : 'sin_boton')
  // Los handlers cambian en cada render del padre; el botón se dibuja una vez.
  const handlers = useRef({ onInicio, onError })
  useEffect(() => {
    handlers.current = { onInicio, onError }
  }, [onInicio, onError])

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelado = false

    void (async () => {
      try {
        const rawNonce = randomNonce()
        const [gsi, hashedNonce] = await Promise.all([loadGsi(), sha256(rawNonce)])
        if (cancelado || !ref.current) return

        gsi.initialize({
          client_id: CLIENT_ID,
          nonce: hashedNonce,
          ux_mode: 'popup',
          use_fedcm_for_button: true,
          itp_support: true,
          callback: async ({ credential }) => {
            if (!credential) return handlers.current.onError('sin_token')
            handlers.current.onInicio()
            const { error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: credential,
              nonce: rawNonce,
            })
            if (error) {
              console.error('[google] signInWithIdToken:', error.message)
              return handlers.current.onError('supabase')
            }
            window.location.assign('/auth/callback')
          },
        })

        // El ancho va en píxeles y Google lo limita a 200–400.
        const ancho = Math.max(200, Math.min(400, Math.round(ref.current.offsetWidth)))
        gsi.renderButton(ref.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: modo === 'register' ? 'signup_with' : 'continue_with',
          logo_alignment: 'center',
          width: ancho,
          locale: 'es',
        })
        setEstado('listo')
      } catch (err) {
        console.warn('[google] botón oficial:', err)
        if (!cancelado) setEstado('sin_boton')
      }
    })()

    return () => {
      cancelado = true
    }
  }, [supabase, modo])

  if (estado === 'sin_boton') return <>{fallback}</>

  return (
    // La altura del botón grande de Google, para que no salte al aparecer.
    <div ref={ref} className="w-full flex justify-center min-h-[44px] [color-scheme:light]" />
  )
}
