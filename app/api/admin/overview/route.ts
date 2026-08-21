import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'

/**
 * GET /api/admin/overview
 *
 * Las métricas globales del panel, calculadas server-side con service role.
 *
 * Existe por dos razones concretas:
 *
 * 1. La fecha de registro real vive en `auth.users.created_at`. `profiles` no
 *    tiene `created_at`, y el panel venía usando `profiles.updated_at` como
 *    reemplazo — pero esa columna se mueve cuando el perfil se edita, así que
 *    los "registros por mes" salían corridos hacia el presente.
 *
 * 2. El panel consulta Supabase desde el navegador con la anon key, o sea
 *    sujeto a RLS. `favorites` tiene RLS owner-only, así que el gráfico de
 *    plataformas favoritas mostraba únicamente las del propio admin,
 *    presentadas como estadística de toda la base.
 *
 * Nada de lo que devuelve este endpoint se puede calcular bien desde el
 * cliente.
 */

// ── Auth ───────────────────────────────────────────────────────────────────

/**
 * Mismo criterio que `app/admin/layout.tsx`: el username del perfil.
 *
 * Sí, es un username hardcodeado y es deuda técnica anotada. Lo que importa acá
 * es no inventar un criterio nuevo: `/api/admin/ban-user` chequea por email
 * (`hola@ferlage.com.ar`) y ya está desalineado con el resto.
 */
async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options) } catch { /**/ } }) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  return profile?.username === 'Ferlageok' ? user : null
}

// ── Tipos ──────────────────────────────────────────────────────────────────

/**
 * Un número con su comparación contra el período anterior.
 *
 * `valor: null` es "sin datos" y NO es lo mismo que 0. Con la medición recién
 * arrancada la diferencia es todo: 0 dice "nadie se conectó", null dice "no
 * sabemos si se conectó alguien". La UI los muestra distinto.
 *
 * `deltaPct: null` es "no comparable", que pasa cuando el período anterior fue
 * 0: no existe el porcentaje de crecimiento desde cero. En ese caso la UI
 * muestra el delta absoluto en vez de inventar un ∞.
 */
export interface Metrica {
  valor: number | null
  previo: number | null
  deltaPct: number | null
}

export interface ActividadResumen {
  /** `false` si las vistas no existen o si todavía no entró un evento humano. */
  disponible: boolean
  /** Desde cuándo se mide. Va en el cartel arriba de las tarjetas. */
  medicionDesde: string | null

  conectadosHoy:    Metrica
  conectadosSemana: Metrica
  anonimosHoy:      Metrica
  sesionesHoy:      Metrica
  /** Promedio en SEGUNDOS. La UI lo formatea. */
  duracionSesion:   Metrica
  /** Promedio de toda la medición, para contexto debajo de la tarjeta. */
  duracionSesionTotal: number | null

  app: {
    usuarios: number
    android: number
    ios: number
    otras: number
    previo: number
    deltaPct: number | null
  }
}

export interface AdminOverview {
  registrosPorMes: { mes: string; total: number }[]
  registrosTotales: number
  confirmados: number
  sinConfirmar: number
  activos7d: number
  activos30d: number
  onboarding: {
    completadoReal: number
    salteado: number
    abandonado: number
    total: number
  }
  plataformasFavoritas: { provider: string; count: number }[]
  paises: { country: string; count: number }[]
  actividad: ActividadResumen
  generadoEn: string
}

// ── Caché de módulo (60s, igual que el emailCache de /api/admin/users) ─────

interface OverviewCache { data: AdminOverview; ts: number }
let overviewCache: OverviewCache | null = null
const OVERVIEW_TTL = 60_000

// ── Helpers ────────────────────────────────────────────────────────────────

interface AuthUserLite {
  created_at: string
  email_confirmed_at: string | null
}

/**
 * Trae `auth.users` completo vía la Admin API, paginando de a 1000.
 *
 * No hay forma de contar sobre `auth.users` con PostgREST: el schema `auth` no
 * está expuesto. Con ~115 usuarios esto es una sola página; el bucle está para
 * cuando deje de serlo.
 */
async function fetchAuthUsers(admin: SupabaseClient): Promise<AuthUserLite[]> {
  const out: AuthUserLite[] = []
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers falló: ${error.message}`)
    if (!data?.users?.length) break
    for (const u of data.users) {
      out.push({
        created_at: u.created_at,
        // El tipo del SDK lo marca opcional; normalizamos a null.
        email_confirmed_at: (u.email_confirmed_at as string | undefined) ?? null,
      })
    }
    if (data.users.length < 1000) break
    page++
  }
  return out
}

/** Lee una tabla entera en tandas de 1000 (el max-rows de PostgREST). */
async function fetchAllRows<T>(
  admin: SupabaseClient,
  table: string,
  columns: string
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    out.push(...(data as T[]))
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

// ── Actividad (analytics) ─────────────────────────────────────────────────

/** Forma cruda de `admin_resumen_actividad`. Una fila, todo numérico. */
interface ResumenRow {
  hoy_desde: string | null
  usuarios_hoy: number
  usuarios_ayer: number
  usuarios_semana: number
  usuarios_semana_prev: number
  anonimos_hoy: number
  anonimos_ayer: number
  sesiones_hoy: number
  sesiones_ayer: number
  seg_prom_hoy: number | null
  seg_prom_ayer: number | null
  seg_prom_total: number | null
  usuarios_con_app: number
  android: number
  ios: number
  otras: number
  usuarios_con_app_prev: number
}

/**
 * Variación porcentual contra el período anterior.
 *
 * Devuelve `null` cuando el período anterior fue 0: no existe el porcentaje de
 * crecimiento desde cero, y mostrar "+∞%" o "+100%" sería inventar. La UI
 * resuelve ese caso mostrando el delta absoluto.
 */
function delta(actual: number, previo: number): number | null {
  if (previo === 0) return null
  return Math.round(((actual - previo) / previo) * 1000) / 10
}

function metrica(actual: number | null, previo: number | null): Metrica {
  if (actual === null) return { valor: null, previo: null, deltaPct: null }
  const prev = previo ?? 0
  return { valor: actual, previo: prev, deltaPct: delta(actual, prev) }
}

const ACTIVIDAD_VACIA: ActividadResumen = {
  disponible: false,
  medicionDesde: null,
  conectadosHoy:    { valor: null, previo: null, deltaPct: null },
  conectadosSemana: { valor: null, previo: null, deltaPct: null },
  anonimosHoy:      { valor: null, previo: null, deltaPct: null },
  sesionesHoy:      { valor: null, previo: null, deltaPct: null },
  duracionSesion:   { valor: null, previo: null, deltaPct: null },
  duracionSesionTotal: null,
  app: { usuarios: 0, android: 0, ios: 0, otras: 0, previo: 0, deltaPct: null },
}

/**
 * Las métricas de actividad, con las vistas de analytics.
 *
 * Nunca tira. Si las vistas no están creadas todavía, o si la medición no
 * arrancó, devuelve el bloque vacío y el resto del resumen —registros,
 * onboarding, países— sigue funcionando igual. Un panel entero caído porque
 * falta una vista de métricas sería un mal negocio.
 *
 * TODO lo que sale de acá excluye bots: `analytics_sessions` y las ventanas de
 * `admin_resumen_actividad` filtran `is_bot = false` en la vista. `user_devices`
 * no necesita el filtro porque no es tráfico web — la escribe la app nativa
 * después de un login, y un crawler no llega nunca.
 */
async function buildActividad(admin: SupabaseClient): Promise<ActividadResumen> {
  const [resumenRes, medicionRes] = await Promise.all([
    admin.from('admin_resumen_actividad').select('*').maybeSingle(),
    admin.from('analytics_medicion').select('desde, eventos_humanos').maybeSingle(),
  ])

  if (resumenRes.error || !resumenRes.data) {
    if (resumenRes.error) console.error('[admin/overview] admin_resumen_actividad:', resumenRes.error.message)
    return ACTIVIDAD_VACIA
  }

  const r = resumenRes.data as unknown as ResumenRow
  const desde = (medicionRes.data?.desde as string | null) ?? null
  const eventosHumanos = Number(medicionRes.data?.eventos_humanos ?? 0)

  // La app se cuenta siempre, haya o no medición: `user_devices` no depende de
  // analytics. Cero dispositivos es un cero verdadero —nadie instaló la app—,
  // no un "no sabemos".
  const app = {
    usuarios: Number(r.usuarios_con_app ?? 0),
    android:  Number(r.android ?? 0),
    ios:      Number(r.ios ?? 0),
    otras:    Number(r.otras ?? 0),
    previo:   Number(r.usuarios_con_app_prev ?? 0),
    deltaPct: delta(Number(r.usuarios_con_app ?? 0), Number(r.usuarios_con_app_prev ?? 0)),
  }

  // Sin un solo evento humano, todo lo demás es "sin datos" y no 0. Un 0 acá
  // diría "no se conectó nadie", que es una afirmación que no podemos sostener
  // cuando lo que pasa es que todavía no estamos midiendo.
  if (eventosHumanos === 0) {
    return { ...ACTIVIDAD_VACIA, medicionDesde: desde, app }
  }

  return {
    disponible: true,
    medicionDesde: desde,
    conectadosHoy:    metrica(Number(r.usuarios_hoy ?? 0),    Number(r.usuarios_ayer ?? 0)),
    conectadosSemana: metrica(Number(r.usuarios_semana ?? 0), Number(r.usuarios_semana_prev ?? 0)),
    anonimosHoy:      metrica(Number(r.anonimos_hoy ?? 0),    Number(r.anonimos_ayer ?? 0)),
    sesionesHoy:      metrica(Number(r.sesiones_hoy ?? 0),    Number(r.sesiones_ayer ?? 0)),
    // `seg_prom_*` viene NULL cuando no hubo ninguna sesión en la ventana. Ese
    // null se propaga como "sin datos" en vez de convertirse en 0 segundos.
    duracionSesion: r.seg_prom_hoy === null
      ? { valor: null, previo: null, deltaPct: null }
      : metrica(Number(r.seg_prom_hoy), r.seg_prom_ayer === null ? 0 : Number(r.seg_prom_ayer)),
    duracionSesionTotal: r.seg_prom_total === null ? null : Number(r.seg_prom_total),
    app,
  }
}

function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Cálculo ────────────────────────────────────────────────────────────────

async function buildOverview(admin: SupabaseClient): Promise<AdminOverview> {
  const now = Date.now()
  const d7  = new Date(now - 7  * 86400_000).toISOString()
  const d30 = new Date(now - 30 * 86400_000).toISOString()

  const [authUsers, profiles, favorites, actividad] = await Promise.all([
    fetchAuthUsers(admin),
    fetchAllRows<{
      country: string | null
      last_active: string | null
      onboarding_completed_at: string | null
      onboarding_skipped: boolean | null
    }>(admin, 'profiles', 'country, last_active, onboarding_completed_at, onboarding_skipped'),
    fetchAllRows<{ provider_name: string | null }>(admin, 'favorites', 'provider_name'),
    buildActividad(admin),
  ])

  // ── Registros por mes (12 meses), con la fecha REAL de auth.users ────────
  const monthBuckets: Record<string, number> = {}
  const monthOrder: string[] = []
  const ref = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthBuckets[k] = 0
    monthOrder.push(k)
  }
  for (const u of authUsers) {
    const k = monthKey(u.created_at)
    if (k in monthBuckets) monthBuckets[k]++
  }
  const registrosPorMes = monthOrder.map(mes => ({ mes, total: monthBuckets[mes] }))

  // ── Confirmación de email ────────────────────────────────────────────────
  // El trigger on_auth_user_created crea el profile en el signUp, antes de que
  // el usuario confirme. Así que "registrosTotales" incluye a gente que nunca
  // volvió del mail.
  const confirmados = authUsers.filter(u => u.email_confirmed_at != null).length

  // ── Actividad ────────────────────────────────────────────────────────────
  const activos7d  = profiles.filter(p => p.last_active != null && p.last_active >= d7).length
  const activos30d = profiles.filter(p => p.last_active != null && p.last_active >= d30).length

  // ── Onboarding ───────────────────────────────────────────────────────────
  // `onboarding_completed = true` no sirve: handleSkip() lo pone en true igual
  // que handleFinish(). La única señal de completado real es el timestamp.
  // El orden importa — se evalúa completado antes que salteado para que un
  // perfil con las dos marcas no se cuente dos veces.
  let completadoReal = 0
  let salteado = 0
  let abandonado = 0
  for (const p of profiles) {
    if (p.onboarding_completed_at != null) completadoReal++
    else if (p.onboarding_skipped === true) salteado++
    else abandonado++
  }

  // ── Plataformas favoritas (todos los usuarios, no solo el admin) ─────────
  const provCounts: Record<string, number> = {}
  for (const f of favorites) {
    if (f.provider_name) provCounts[f.provider_name] = (provCounts[f.provider_name] ?? 0) + 1
  }
  const plataformasFavoritas = Object.entries(provCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([provider, count]) => ({ provider, count }))

  // ── Países ───────────────────────────────────────────────────────────────
  // Ojo: hoy esto es un default, no geolocalización. Ver la nota en /admin/metricas.
  const countryCounts: Record<string, number> = {}
  for (const p of profiles) {
    if (p.country) countryCounts[p.country] = (countryCounts[p.country] ?? 0) + 1
  }
  const paises = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([country, count]) => ({ country, count }))

  return {
    registrosPorMes,
    registrosTotales: authUsers.length,
    confirmados,
    sinConfirmar: authUsers.length - confirmados,
    activos7d,
    activos30d,
    onboarding: {
      completadoReal,
      salteado,
      abandonado,
      total: profiles.length,
    },
    plataformasFavoritas,
    paises,
    actividad,
    generadoEn: new Date().toISOString(),
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET() {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (overviewCache && Date.now() - overviewCache.ts < OVERVIEW_TTL) {
    return NextResponse.json(overviewCache.data, {
      headers: { 'Cache-Control': 'private, max-age=60', 'X-Cache': 'HIT' },
    })
  }

  const { admin, failure } = requireAdminClient('admin/overview')
  if (failure) return failure

  let data: AdminOverview
  try {
    data = await buildOverview(admin)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[admin/overview]', message)
    return NextResponse.json({ error: 'overview_failed', message }, { status: 500 })
  }

  overviewCache = { data, ts: Date.now() }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, max-age=60', 'X-Cache': 'MISS' },
  })
}
