'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { COUNTRIES, DEFAULT_COUNTRY, getCountry, type Country } from '@/lib/countries'
import { createClient } from '@/lib/supabase'

const LS_KEY = 'glynbox_country'

interface CountryCtx {
  country: string
  countryData: Country
  setCountry: (code: string) => void
}

const CountryContext = createContext<CountryCtx>({
  country: DEFAULT_COUNTRY,
  countryData: getCountry(DEFAULT_COUNTRY),
  setCountry: () => {},
})

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [country, setCountryState] = useState(DEFAULT_COUNTRY)
  const supabase = useRef(createClient()).current

  useEffect(() => {
    const valido = (code: string | null | undefined): code is string =>
      !!code && COUNTRIES.some(c => c.code === code)

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      const saved = localStorage.getItem(LS_KEY)

      // Sin sesión y con un país ya guardado en este navegador (elegido o
      // detectado antes): se respeta, sin pedir nada.
      if (!user && valido(saved)) {
        setCountryState(saved)
        return
      }

      // Con sesión, o en la primera visita: decide el servidor, con el país que
      // Vercel saca de la IP. Con sesión además lo guarda en el perfil, salvo
      // que la persona lo haya elegido a mano (ver /api/perfil/pais).
      try {
        const res = await fetch('/api/perfil/pais', { method: user ? 'POST' : 'GET' })
        const { pais } = (await res.json()) as { pais?: string | null }
        // Un país real que no está en COUNTRIES queda en el perfil para las
        // métricas, pero la página sigue con el guardado o el de por defecto:
        // no hay catálogo de streaming para mostrarle.
        if (valido(pais)) {
          setCountryState(pais)
          localStorage.setItem(LS_KEY, pais)
          return
        }
      } catch {}

      if (valido(saved)) setCountryState(saved)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Elegir un país a mano —en Ajustes o en el selector del encabezado— lo deja
   * como `manual`, y la detección automática no lo vuelve a pisar.
   */
  const setCountry = useCallback(async (code: string) => {
    setCountryState(code)
    localStorage.setItem(LS_KEY, code)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ country: code, country_source: 'manual' })
        .eq('id', user.id)
      // Sin `country_source` (falta la migración) se guarda como antes.
      if (error) await supabase.from('profiles').update({ country: code }).eq('id', user.id)
    }
  }, [supabase])

  return (
    <CountryContext.Provider value={{ country, countryData: getCountry(country), setCountry }}>
      {children}
    </CountryContext.Provider>
  )
}

export function useCountry() {
  return useContext(CountryContext)
}
