import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'
import { fetchAllRows, mesAR } from '@/lib/admin-filas'
import { ALL_PLATFORMS } from '@/lib/providers'
import { normalizeSavedPlatforms } from '@/lib/onboarding'

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
 *    sujeto a RLS y al corte de 1000 filas de PostgREST: lo de los usuarios
 *    privados no se veía y las tablas grandes llegaban cortadas. Lo de
 *    contenido (reseñas, calificaciones, listas) está en `/api/admin/contenido`.
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

  /**
   * `true` si "ayer" es ayer hasta la misma hora que ahora. `false` si la
   * vista todavía es la vieja (falta el SQL) y "ayer" es el día entero.
   */
  ayerMismaHora: boolean
  conectadosHoy:    Metrica
  conectadosSemana: Metrica
  /** Usuarios distintos en 30 días. `null` si falta el SQL. */
  conectados30d:    number | null
  anonimosHoy:      Metrica
  /** Los anónimos de hoy, separados. `null` si falta el SQL. */
  anonimosHoyWeb:   Metrica | null
  anonimosHoyApp:   Metrica | null
  sesionesHoy:      Metrica
  /** Promedio en SEGUNDOS. La UI lo formatea. */
  duracionSesion:   Metrica
  /** Promedio de toda la medición, para contexto debajo de la tarjeta. */
  duracionSesionTotal: number | null

  /**
   * Usuarios con token de notificaciones (`user_devices`). NO es "tienen la
   * app": sólo entran los que iniciaron sesión en la app y aceptaron el
   * permiso. Va como línea secundaria del recuadro de la app.
   */
  app: {
    usuarios: number
    android: number
    ios: number
    otras: number
    previo: number
    deltaPct: number | null
  }

  /** El recuadro de la app. Ver `supabase-analytics-app-uso-2026-10.sql`. */
  appUso: AppUso
}

export interface AppUso {
  /** `false` si todavía no se corrió el SQL: el panel cae al número viejo. */
  disponible: boolean
  /** Instalaciones (`anon_id` de la app) con eventos en los últimos 30 días. */
  activas: Metrica
  conSesion: number
  sinSesion: number
  android: number
  ios: number
  /** Instalaciones que todavía no mandaron de qué sistema son. */
  sinSistema: number
  /** Primer evento de la app. Si es de hace menos de 30 días, la ventana no está llena. */
  desde: string | null
  /** "Dispositivos activos" de Google Play, el último día publicado. */
  play: { activos: number; fecha: string } | null
}

export interface AdminOverview {
  registrosPorMes: { mes: string; total: number }[]
  registrosTotales: number
  confirmados: number
  sinConfirmar: number
  /**
   * Usuarios distintos con algún evento (web o app) en los últimos 7 y 30
   * días de Argentina. Mismo criterio que "Se conectaron esta semana": sale de
   * `analytics_events`, no de `profiles.last_active`, que escribe sólo la web
   * (eran 22 contra 504). `null` si falta la vista, o el SQL nuevo (30 días).
   */
  activos7d: number | null
  activos30d: number | null
  onboarding: {
    completadoReal: number
    salteado: number
    abandonado: number
    total: number
  }
  /**
   * Las plataformas que eligen en el onboarding (`profiles.favorite_platforms`,
   * web y app), las 15 aunque estén en cero. `pct` es sobre los perfiles que
   * eligieron alguna.
   */
  plataformasFavoritas: { provider: string; count: number; pct: number }[]
  plataformasCobertura: { conPlataformas: number; total: number }
  /** Sólo perfiles con país real (`country_source` 'auto' o 'manual'). */
  paises: { country: string; count: number }[]
  /**
   * Cuántos perfiles tienen país real, de cuántos. `conPais = 0` es "todavía no
   * hay datos" y el panel muestra el cartel de advertencia.
   */
  paisesCobertura: { conPais: number; total: number }
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

interface PerfilFila {
  country: string | null
  /** 'auto' | 'manual' | null. Ver `supabase-pais-real-2026-10.sql`. */
  country_source: string | null
  favorite_platforms: (string | number)[] | null
  onboarding_completed_at: string | null
  onboarding_skipped: boolean | null
}

/**
 * Los perfiles, con `country_source` si la columna ya existe. Si todavía no se
 * corrió la migración se leen sin ella: el resto del resumen no tiene por qué
 * caerse, y "Usuarios por país" queda vacío, que es lo correcto.
 */
async function fetchProfiles(admin: SupabaseClient): Promise<PerfilFila[]> {
  const base = 'country, favorite_platforms, onboarding_completed_at, onboarding_skipped'
  try {
    return await fetchAllRows<PerfilFila>(admin, 'profiles', `${base}, country_source`)
  } catch (err) {
    console.warn('[admin/overview] perfiles sin country_source:', (err as Error).message)
    const filas = await fetchAllRows<Omit<PerfilFila, 'country_source'>>(admin, 'profiles', base)
    return filas.map(f => ({ ...f, country_source: null }))
  }
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
  // Las de supabase-metricas-2026-10.sql. Sin ese SQL no vienen.
  usuarios_30d?: number
  anonimos_hoy_web?: number
  anonimos_hoy_app?: number
  anonimos_ayer_web?: number
  anonimos_ayer_app?: number
  ayer_hasta?: string
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
  ayerMismaHora: false,
  conectadosHoy:    { valor: null, previo: null, deltaPct: null },
  conectadosSemana: { valor: null, previo: null, deltaPct: null },
  conectados30d:    null,
  anonimosHoy:      { valor: null, previo: null, deltaPct: null },
  anonimosHoyWeb:   null,
  anonimosHoyApp:   null,
  sesionesHoy:      { valor: null, previo: null, deltaPct: null },
  duracionSesion:   { valor: null, previo: null, deltaPct: null },
  duracionSesionTotal: null,
  app: { usuarios: 0, android: 0, ios: 0, otras: 0, previo: 0, deltaPct: null },
  appUso: {
    disponible: false,
    activas: { valor: null, previo: null, deltaPct: null },
    conSesion: 0, sinSesion: 0, android: 0, ios: 0, sinSistema: 0,
    desde: null,
    play: null,
  },
}

interface AppUsoRow {
  activas: number
  con_sesion: number
  sin_sesion: number
  android: number
  ios: number
  sin_sistema: number
  activas_prev: number
  desde: string | null
}

/**
 * Las instalaciones de la app que se usan, y los dispositivos activos de Play
 * para ponerlos al lado.
 *
 * Nunca tira, igual que `buildActividad`: sin la función SQL devuelve
 * `disponible: false` y el panel muestra el número de notificaciones como
 * antes. Play va aparte: puede faltar sin que falte lo otro.
 */
async function buildAppUso(admin: SupabaseClient): Promise<AppUso> {
  const [usoRes, playRes] = await Promise.all([
    admin.rpc('admin_app_uso'),
    admin
      .from('play_install_stats')
      .select('fecha, base_instalada')
      .eq('package_name', 'com.glynbox.app')
      .not('base_instalada', 'is', null)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (playRes.error) console.error('[admin/overview] play_install_stats:', playRes.error.message)
  const play = playRes.data
    ? { activos: Number(playRes.data.base_instalada), fecha: String(playRes.data.fecha) }
    : null

  const fila = (usoRes.data as AppUsoRow[] | null)?.[0]
  if (usoRes.error || !fila) {
    if (usoRes.error) console.error('[admin/overview] admin_app_uso:', usoRes.error.message)
    return { ...ACTIVIDAD_VACIA.appUso, play }
  }

  const activas = Number(fila.activas)
  const previo = Number(fila.activas_prev)
  return {
    disponible: true,
    activas: { valor: activas, previo, deltaPct: delta(activas, previo) },
    conSesion:  Number(fila.con_sesion),
    sinSesion:  Number(fila.sin_sesion),
    android:    Number(fila.android),
    ios:        Number(fila.ios),
    sinSistema: Number(fila.sin_sistema),
    desde: fila.desde,
    play,
  }
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
  const [resumenRes, medicionRes, appUso] = await Promise.all([
    admin.from('admin_resumen_actividad').select('*').maybeSingle(),
    admin.from('analytics_medicion').select('desde, eventos_humanos').maybeSingle(),
    buildAppUso(admin),
  ])

  if (resumenRes.error || !resumenRes.data) {
    if (resumenRes.error) console.error('[admin/overview] admin_resumen_actividad:', resumenRes.error.message)
    return { ...ACTIVIDAD_VACIA, appUso }
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
    return { ...ACTIVIDAD_VACIA, medicionDesde: desde, app, appUso }
  }

  // Las columnas nuevas vienen sólo con supabase-metricas-2026-10.sql. Sin
  // ellas, todo sigue como antes: "ayer" es el día entero y los anónimos van
  // en un solo número.
  const nueva = r.ayer_hasta !== undefined
  const anonimosDe = (hoy: number | undefined, ayer: number | undefined) =>
    nueva ? metrica(Number(hoy ?? 0), Number(ayer ?? 0)) : null

  return {
    disponible: true,
    medicionDesde: desde,
    ayerMismaHora: nueva,
    conectadosHoy:    metrica(Number(r.usuarios_hoy ?? 0),    Number(r.usuarios_ayer ?? 0)),
    conectadosSemana: metrica(Number(r.usuarios_semana ?? 0), Number(r.usuarios_semana_prev ?? 0)),
    conectados30d:    r.usuarios_30d === undefined ? null : Number(r.usuarios_30d),
    anonimosHoy:      metrica(Number(r.anonimos_hoy ?? 0),    Number(r.anonimos_ayer ?? 0)),
    anonimosHoyWeb:   anonimosDe(r.anonimos_hoy_web, r.anonimos_ayer_web),
    anonimosHoyApp:   anonimosDe(r.anonimos_hoy_app, r.anonimos_ayer_app),
    sesionesHoy:      metrica(Number(r.sesiones_hoy ?? 0),    Number(r.sesiones_ayer ?? 0)),
    // `seg_prom_*` viene NULL cuando no hubo ninguna sesión en la ventana. Ese
    // null se propaga como "sin datos" en vez de convertirse en 0 segundos.
    duracionSesion: r.seg_prom_hoy === null
      ? { valor: null, previo: null, deltaPct: null }
      : metrica(Number(r.seg_prom_hoy), r.seg_prom_ayer === null ? 0 : Number(r.seg_prom_ayer)),
    duracionSesionTotal: r.seg_prom_total === null ? null : Number(r.seg_prom_total),
    app,
    appUso,
  }
}

// ── Cálculo ────────────────────────────────────────────────────────────────

async function buildOverview(admin: SupabaseClient): Promise<AdminOverview> {
  const [authUsers, profiles, actividad] = await Promise.all([
    fetchAuthUsers(admin),
    fetchProfiles(admin),
    buildActividad(admin),
  ])

  // ── Registros por mes (12 meses), con la fecha REAL de auth.users ────────
  // Meses de Argentina: con los de UTC (o los del servidor, que es UTC), un
  // alta del 31 a las 22 caía en el mes siguiente.
  const monthBuckets: Record<string, number> = {}
  const monthOrder: string[] = []
  const [anio, mes] = mesAR(Date.now()).split('-').map(Number)
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(anio, mes - 1 - i, 1))
    const k = d.toISOString().slice(0, 7)
    monthBuckets[k] = 0
    monthOrder.push(k)
  }
  for (const u of authUsers) {
    const k = mesAR(u.created_at)
    if (k in monthBuckets) monthBuckets[k]++
  }
  const registrosPorMes = monthOrder.map(mes => ({ mes, total: monthBuckets[mes] }))

  // ── Confirmación de email ────────────────────────────────────────────────
  // El trigger on_auth_user_created crea el profile en el signUp, antes de que
  // el usuario confirme. Así que "registrosTotales" incluye a gente que nunca
  // volvió del mail.
  const confirmados = authUsers.filter(u => u.email_confirmed_at != null).length

  // ── Actividad ────────────────────────────────────────────────────────────
  // De los eventos, web y app: ver `activos7d` en `AdminOverview`.
  const activos7d  = actividad.conectadosSemana.valor
  const activos30d = actividad.conectados30d

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

  // ── Plataformas favoritas ────────────────────────────────────────────────
  // Las que cada uno eligió en el onboarding (web o app), no el proveedor de
  // los títulos que marcó con "Me gusta": ese lo guardaba sólo la web, crudo
  // de TMDB y de cualquier país ("Sooner Amazon Channel"). Ids viejos
  // canonizados (384 → 1899) y nombres de `ALL_PLATFORMS`.
  const provCounts = new Map<number, number>(ALL_PLATFORMS.map(pl => [pl.id, 0]))
  let conPlataformas = 0
  for (const p of profiles) {
    const ids = normalizeSavedPlatforms(p.favorite_platforms).filter(id => provCounts.has(id))
    if (ids.length === 0) continue
    conPlataformas++
    for (const id of ids) provCounts.set(id, (provCounts.get(id) ?? 0) + 1)
  }
  const plataformasFavoritas = ALL_PLATFORMS
    .map(pl => {
      const count = provCounts.get(pl.id) ?? 0
      return { provider: pl.name, count, pct: conPlataformas > 0 ? Math.round((count / conPlataformas) * 100) : 0 }
    })
    .sort((a, b) => b.count - a.count)

  // ── Países ───────────────────────────────────────────────────────────────
  // Sólo los que tienen origen: un `country_source` NULL es el 'AR' por defecto
  // de antes de la detección, y contarlo mostraría una distribución inventada.
  const countryCounts: Record<string, number> = {}
  let conPais = 0
  for (const p of profiles) {
    if (!p.country || !p.country_source) continue
    conPais++
    countryCounts[p.country] = (countryCounts[p.country] ?? 0) + 1
  }
  const paises = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([country, count]) => ({ country, count }))
  const paisesCobertura = { conPais, total: profiles.length }

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
    plataformasCobertura: { conPlataformas, total: profiles.length },
    paises,
    paisesCobertura,
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
