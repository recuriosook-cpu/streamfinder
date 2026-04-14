'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { COUNTRIES, DEFAULT_COUNTRY, getCountry, type Country } from '@/lib/countries'

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

  useEffect(() => {
    // 1. Check localStorage
    const saved = localStorage.getItem(LS_KEY)
    if (saved && COUNTRIES.find(c => c.code === saved)) {
      setCountryState(saved)
      return
    }

    // 2. Auto-detect via IP (first visit only)
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then((data: { country_code?: string }) => {
        const code = data.country_code
        if (code && COUNTRIES.find(c => c.code === code)) {
          setCountryState(code)
          localStorage.setItem(LS_KEY, code)
        }
      })
      .catch(() => {
        // Silently fall back to default (AR)
      })
  }, [])

  const setCountry = useCallback((code: string) => {
    setCountryState(code)
    localStorage.setItem(LS_KEY, code)
  }, [])

  return (
    <CountryContext.Provider value={{ country, countryData: getCountry(country), setCountry }}>
      {children}
    </CountryContext.Provider>
  )
}

export function useCountry() {
  return useContext(CountryContext)
}
