/**
 * Completa `watched.genre_ids` desde TMDB para todos los títulos que faltan.
 * Toda la lógica está en lib/generos-watched.ts; esto es para correrla una vez
 * a mano (después la sigue /api/cron/generos todos los días).
 *
 * Antes: correr supabase-generos-y-aviso-wrapped-2026-11.sql en Supabase.
 *
 *   npx -y tsx scripts/completar-generos.ts            todos los títulos
 *   npx -y tsx scripts/completar-generos.ts --max=50   sólo 50, para probar
 *
 * Se puede cortar y volver a correr: sigue con lo que falta.
 */

import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { completarGeneros } from '../lib/generos-watched'

try {
  process.loadEnvFile(resolve(process.cwd(), '.env.local'))
} catch {
  console.error('No encontré .env.local: corré el script desde la carpeta del repo.')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const clave = process.env.SUPABASE_SERVICE_ROLE
if (!url || !clave || !process.env.NEXT_PUBLIC_TMDB_API_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE o NEXT_PUBLIC_TMDB_API_KEY en .env.local.')
  process.exit(1)
}

const max = Number(process.argv.find(a => a.startsWith('--max='))?.slice(6)) || undefined
const admin = createClient(url, clave, { auth: { persistSession: false } })
const inicio = Date.now()

completarGeneros(admin, {
  maxTitulos: max,
  alAvanzar: r => {
    const hechos = r.conGeneros + r.sinDatos
    console.log(`${hechos}/${r.titulos} títulos · ${r.filas} filas actualizadas · ${r.sinDatos} sin datos en TMDB · ${Math.round((Date.now() - inicio) / 1000)} s`)
  },
}).then(r => {
  console.log('Listo:', JSON.stringify(r))
}).catch(err => {
  console.error('Falló:', (err as Error).message)
  process.exit(1)
})
