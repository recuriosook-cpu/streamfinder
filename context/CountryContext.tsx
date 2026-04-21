'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { COUNTRIES, DEFAULT_COUNTRY, getCountry, type Country } from '@/lib/countries'
import { createClient } from '@/lib/supabase'

const LS_KEY = 'streamfinder_country'

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
    async function init() {
      // 1. Check if user is logged in — profile.country takes priority
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('country')
          .eq('id', user.id)
          .maybeSingle()
        const profileCountry = (profile as { country?: string | null } | null)?.country
        if (profileCountry && COUNTRIES.find(c => c.code === profileCountry)) {
          setCountryState(profileCountry)
          localStorage.setItem(LS_KEY, profileCountry)
          return
        }
      }

      // 2. Fall back to localStorage
      const saved = localStorage.getItem(LS_KEY)
      if (saved && COUNTRIES.find(c => c.code === saved)) {
        setCountryState(saved)
        // Sync to profile if logged in but had no country saved
        if (user) {
          supabase.from('profiles').update({ country: saved }).eq('id', user.id)
        }
        return
      }

      // 3. Auto-detect via IP (first visit only)
      fetch('https://ipapi.co/json/')
        .then(r => r.json())
        .then(async (data: { country_code?: string }) => {
          const code = data.country_code
          if (code && COUNTRIES.find(c => c.code === code)) {
            setCountryState(code)
            localStorage.setItem(LS_KEY, code)
            if (user) {
              await supabase.from('profiles').update({ country: code }).eq('id', user.id)
            }
          }
        })
        .catch(() => {})
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setCountry = useCallback(async (code: string) => {
    setCountryState(code)
    localStorage.setItem(LS_KEY, code)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      supabase.from('profiles').update({ country: code }).eq('id', user.id)
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
