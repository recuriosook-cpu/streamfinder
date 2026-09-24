/**
 * Carga completa del índice del buscador: todos los años, películas y series.
 * Después lo mantiene el cron semanal `/api/cron/search-index`; esto se corre
 * una vez al principio, o si el índice quedó mal y hay que rehacerlo.
 *
 * Requisitos: haber corrido `supabase-search-index.sql`, y tener
 * `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` y
 * `NEXT_PUBLIC_TMDB_API_KEY` en `.env.local`.
 *
 * Uso:
 *   node --env-file=.env.local scripts/sync-search-index.mjs
 *   node --env-file=.env.local scripts/sync-search-index.mjs --desde 2020 --hasta 2026
 *
 * Son ~13.000 pedidos a TMDB y unos 8 minutos. Se puede cortar y volver a
 * correr: cada tramo se guarda con upsert, así que repetir no duplica nada.
 * Cómo se recorre TMDB y qué se borra está en `lib/search-index-sync.ts`.
 */

import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { sincronizarTramo, tramosPorAnio } from '../lib/search-index-sync.ts'

const { values: args } = parseArgs({
  options: {
    desde: { type: 'string', default: '1900' },
    hasta: { type: 'string', default: String(new Date().getFullYear()) },
  },
})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE
const TMDB_KEY     = process.env.NEXT_PUBLIC_TMDB_API_KEY

if (!SUPABASE_URL || !SERVICE_KEY || !TMDB_KEY) {
  console.error('\n❌  Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE o NEXT_PUBLIC_TMDB_API_KEY. ¿Corriste con --env-file=.env.local?\n')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const tramos = tramosPorAnio(Number(args.desde), Number(args.hasta))
const inicio = Date.now()
let titulos = 0, borrados = 0, pedidos = 0
const fallidos = []

for (const [i, tramo] of tramos.entries()) {
  const n = `[${String(i + 1).padStart(3)}/${tramos.length}]`
  try {
    for (const r of await sincronizarTramo(db, tramo, { apiKey: TMDB_KEY })) {
      titulos += r.titulos
      borrados += r.borrados
      pedidos += r.pedidos
      console.log(`${n} ${r.tramo.mediaType.padEnd(5)} ${r.tramo.desde}..${r.tramo.hasta}  ${r.titulos} títulos${r.borrados ? `, ${r.borrados} borrados` : ''}`)
    }
  } catch (e) {
    fallidos.push({ tramo, motivo: e.message })
    console.log(`${n} ✗ ${tramo.mediaType} ${tramo.desde}..${tramo.hasta}: ${e.message}`)
  }
}

const seg = (Date.now() - inicio) / 1000
console.log('\n── Resultado ─────────────────────────────')
console.log(`Títulos:   ${titulos}`)
console.log(`Borrados:  ${borrados}`)
console.log(`Pedidos:   ${pedidos} (${(pedidos / seg).toFixed(1)} por segundo)`)
console.log(`Tiempo:    ${Math.round(seg)} s`)
if (fallidos.length) {
  console.log(`\nFallidos (volvé a correr con --desde/--hasta para esos años):`)
  for (const f of fallidos) console.log(`  - ${f.tramo.mediaType} ${f.tramo.desde.slice(0, 4)}: ${f.motivo}`)
  process.exitCode = 1
}
console.log()
