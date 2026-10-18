import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'

/**
 * GET /api/admin/app-medicion — lo nuevo de la app en `/admin/metricas`.
 *
 *   · Embudo de onboarding por flujo: el corto (props.flujo = 'corto') y el
 *     viejo (sin flujo), de la app y de la web por separado.
 *   · Notificaciones: el pedido de permiso por origen, cuántos tienen token y
 *     cuántos apagaron cada interruptor.
 *   · Modo deslizar: aperturas por origen, tarjetas por persona y acciones.
 *
 * Todo sale de `analytics_events` sin bots, salvo los tokens (`user_devices`),
 * las instalaciones (`admin_app_uso`, la misma definición que el resumen) y
 * los interruptores (`profiles.notification_preferences`), que son la foto de
 * hoy. Una "persona" es un `anon_id`: una instalación de la app o un
 * navegador. Cada bloque devuelve desde cuándo hay datos.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

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

export interface PasoEmbudo {
  nombre: string
  /** Personas que llegaron a ver el paso. */
  personas: number
  /** Sobre las que vieron el primero. */
  pct: number | null
  /** Personas que tocaron "Saltar" en este paso. */
  saltearon: number
}

export interface EmbudoOnboarding {
  clave: 'app_corto' | 'app_viejo' | 'web_corto' | 'web'
  titulo: string
  desde: string | null
  ultimo: string | null
  pasos: PasoEmbudo[]
  /** Saltos en un paso que el flujo no tiene (no debería pasar). */
  saltosSinPaso: number
}

export interface PermisoOrigen {
  origen: string
  ofrecidos: number
  aceptaron: number
  /** Tocaron "Sí" y el sistema no dio el permiso (lo negaron en el diálogo o falló). */
  negadoPorSistema: number
  ahoraNo: number
}

/** Una tajada del recordatorio de notificaciones (1.0.16 en adelante). */
export interface RecordatorioFila {
  clave: string
  nombre: string
  vieron: number
  /** Tocaron "Activar" o "Abrir ajustes". */
  tocaron: number
  activaron: number
  ahoraNo: number
}

export interface Recordatorio {
  desde: string | null
  total: RecordatorioFila
  porMomento: RecordatorioFila[]
  porEstado: RecordatorioFila[]
}

export interface MedicionApp {
  onboarding: EmbudoOnboarding[]
  notificaciones: {
    permisoDesde: string | null
    permiso: PermisoOrigen[]
    recordatorio: Recordatorio
    usuariosConToken: number
    aparatosConToken: number
    /** Instalaciones activas en 30 días, la definición de `admin_app_uso`. `null` si no está la función. */
    instalacionesActivas: number | null
    instalacionesConSesion: number | null
    /** Sólo si la medición de la app tiene menos de 30 días: la ventana todavía no está llena. */
    instalacionesDesde: string | null
    perfiles: number
    interruptores: { clave: string; nombre: string; apagados: number; apagadosConToken: number }[]
  }
  deslizar: {
    desde: string | null
    aperturas: { origen: string; veces: number; personas: number }[]
    personas: number
    tarjetasPromedio: number | null
    tarjetasMediana: number | null
    acciones: { accion: string; nombre: string; veces: number; pct: number | null }[]
    deshechas: number
  }
}

// ── Lectura ────────────────────────────────────────────────────────────────

interface Evento {
  name: string
  anon_id: string
  platform: string | null
  path: string | null
  props: Record<string, unknown> | null
  created_at: string
}

async function eventos(admin: SupabaseClient, nombres: string[]): Promise<Evento[]> {
  const filas: Evento[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin
      .from('analytics_events')
      .select('name, anon_id, platform, path, props, created_at')
      .in('name', nombres)
      .eq('is_bot', false)
      .order('created_at', { ascending: true })
      .range(desde, desde + 999)
    if (error) throw new Error(error.message)
    filas.push(...((data ?? []) as Evento[]))
    if (!data || data.length < 1000) break
  }
  return filas
}

async function pantallasRecomendaciones(admin: SupabaseClient): Promise<Evento[]> {
  const { data, error } = await admin
    .from('analytics_events')
    .select('name, anon_id, platform, path, props, created_at')
    .eq('name', 'page_view')
    .eq('path', '/onboarding/recomendaciones')
    .eq('is_bot', false)
    .order('created_at', { ascending: true })
    .limit(10000)
  if (error) throw new Error(error.message)
  return (data ?? []) as Evento[]
}

const prop = (e: Evento, k: string): unknown => e.props?.[k]
const pct = (n: number, de: number): number | null => (de > 0 ? Math.round((n / de) * 1000) / 10 : null)

function rango(evs: Evento[]): { desde: string | null; ultimo: string | null } {
  if (evs.length === 0) return { desde: null, ultimo: null }
  let desde = evs[0].created_at
  let ultimo = evs[0].created_at
  for (const e of evs) {
    if (e.created_at < desde) desde = e.created_at
    if (e.created_at > ultimo) ultimo = e.created_at
  }
  return { desde, ultimo }
}

function personas(evs: Evento[]): number {
  return new Set(evs.map(e => e.anon_id)).size
}

// ── Onboarding ─────────────────────────────────────────────────────────────

const FLUJOS: { clave: EmbudoOnboarding['clave']; titulo: string; pasos: string[] }[] = [
  { clave: 'app_corto', titulo: 'App — flujo nuevo (3 pasos)', pasos: ['Plataformas', 'Géneros', 'Gusto'] },
  {
    clave: 'app_viejo',
    titulo: 'App — flujo anterior (6 pasos)',
    pasos: ['Nombre', 'Géneros', 'Plataformas', 'Seguir usuarios', 'Calificar', 'Notificaciones'],
  },
  { clave: 'web_corto', titulo: 'Web — flujo nuevo (3 pasos)', pasos: ['Plataformas', 'Géneros', 'Gusto'] },
  { clave: 'web', titulo: 'Web — flujo anterior (5 pasos)', pasos: ['Nombre', 'Géneros', 'Plataformas', 'Seguir usuarios', 'Calificar'] },
]

/** Los flujos nuevos, que se muestran siempre y terminan en "Tus primeras recomendaciones". */
const CORTOS: EmbudoOnboarding['clave'][] = ['app_corto', 'web_corto']

/** Los flujos viejos se muestran mientras sigan llegando datos: algo en los últimos 30 días. */
const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000

function flujoDe(e: Evento): EmbudoOnboarding['clave'] {
  const corto = prop(e, 'flujo') === 'corto'
  if (e.platform !== 'mobile') return corto ? 'web_corto' : 'web'
  return corto ? 'app_corto' : 'app_viejo'
}

function embudos(evs: Evento[], recomendaciones: Evento[]): EmbudoOnboarding[] {
  const salida: EmbudoOnboarding[] = []
  for (const flujo of FLUJOS) {
    const propios = evs.filter(e => flujoDe(e) === flujo.clave)
    const vistos = propios.filter(e => e.name === 'onboarding_step_viewed')
    const saltos = propios.filter(e => e.name === 'onboarding_skipped')
    const recos =
      flujo.clave === 'app_corto' ? recomendaciones.filter(e => e.platform === 'mobile')
      : flujo.clave === 'web_corto' ? recomendaciones.filter(e => e.platform !== 'mobile')
      : []

    const { desde, ultimo } = rango([...propios, ...recos])
    const vigente = ultimo !== null && Date.now() - new Date(ultimo).getTime() < VIGENCIA_MS
    // Los flujos nuevos van siempre, aunque estén vacíos: son los que hay que mirar.
    if (!CORTOS.includes(flujo.clave) && !vigente) continue

    const pasos: PasoEmbudo[] = flujo.pasos.map((nombre, i) => {
      const paso = i + 1
      return {
        nombre,
        personas: personas(vistos.filter(e => Number(prop(e, 'paso')) === paso)),
        pct: null,
        saltearon: personas(saltos.filter(e => Number(prop(e, 'paso')) === paso)),
      }
    })
    if (CORTOS.includes(flujo.clave)) {
      pasos.push({ nombre: 'Vio sus recomendaciones', personas: personas(recos), pct: null, saltearon: 0 })
    }
    const base = pasos[0]?.personas ?? 0
    for (const p of pasos) p.pct = pct(p.personas, base)

    const conPaso = new Set(flujo.pasos.map((_, i) => i + 1))
    salida.push({
      clave: flujo.clave,
      titulo: flujo.titulo,
      desde,
      ultimo,
      pasos,
      saltosSinPaso: personas(saltos.filter(e => !conPaso.has(Number(prop(e, 'paso'))))),
    })
  }
  return salida
}

// ── Notificaciones ─────────────────────────────────────────────────────────

// 'watchlist' sigue apareciendo mientras haya eventos: es el ofrecimiento de
// una vez que reemplazó el recordatorio en la 1.0.16.
const ORIGENES = ['onboarding']
const RECORDATORIO = 'recordatorio'

function permiso(evs: Evento[]): PermisoOrigen[] {
  const origenes = [...new Set([...ORIGENES, ...evs.map(e => String(prop(e, 'origen') ?? 'sin origen'))])]
    // El recordatorio tiene su propio embudo: "aceptaron" no cuenta a los que
    // fueron por los ajustes.
    .filter(o => o !== RECORDATORIO)
  return origenes.map(origen => {
    const de = evs.filter(e => String(prop(e, 'origen') ?? 'sin origen') === origen)
    const aceptados = de.filter(e => e.name === 'push_aceptado')
    return {
      origen,
      ofrecidos: personas(de.filter(e => e.name === 'push_ofrecido')),
      aceptaron: personas(aceptados.filter(e => prop(e, 'resultado') === 'granted')),
      negadoPorSistema: personas(aceptados.filter(e => prop(e, 'resultado') !== 'granted')),
      ahoraNo: personas(de.filter(e => e.name === 'push_ahora_no')),
    }
  })
}

const MOMENTOS: Record<string, string> = { watchlist: 'Al guardar en Ver después', regreso: 'Al volver después de días' }
const ESTADOS: Record<string, string> = { sin_preguntar: 'Nunca vio el aviso del sistema', bloqueado: 'Bloqueado en el sistema' }

function filaRecordatorio(clave: string, nombre: string, evs: Evento[]): RecordatorioFila {
  return {
    clave,
    nombre,
    vieron: personas(evs.filter(e => e.name === 'push_ofrecido')),
    tocaron: personas(evs.filter(e => e.name === 'push_aceptado' || e.name === 'push_ajustes_abiertos')),
    activaron: personas(evs.filter(e => e.name === 'push_activado')),
    ahoraNo: personas(evs.filter(e => e.name === 'push_ahora_no')),
  }
}

/** Una fila por valor de `clave`: los conocidos siempre, los otros si aparecen. */
function tajadas(evs: Evento[], clave: string, nombres: Record<string, string>): RecordatorioFila[] {
  const valores = [...new Set([...Object.keys(nombres), ...evs.map(e => String(prop(e, clave) ?? '?'))])]
  return valores.map(v =>
    filaRecordatorio(v, nombres[v] ?? v, evs.filter(e => String(prop(e, clave) ?? '?') === v)))
}

function recordatorio(evs: Evento[]): Recordatorio {
  const de = evs.filter(e => prop(e, 'origen') === RECORDATORIO)
  return {
    desde: rango(de).desde,
    total: filaRecordatorio('total', 'Total', de),
    porMomento: tajadas(de, 'momento', MOMENTOS),
    porEstado: tajadas(de, 'estado', ESTADOS),
  }
}

const INTERRUPTORES = [
  { clave: 'recomendaciones_ferlage', nombre: 'Recomendaciones de Ferlage' },
  { clave: 'resumen_semanal', nombre: 'Tu resumen semanal' },
]

async function tokens(admin: SupabaseClient): Promise<Map<string, number>> {
  const porUsuario = new Map<string, number>()
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.from('user_devices').select('user_id').range(desde, desde + 999)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as { user_id: string }[]) {
      porUsuario.set(row.user_id, (porUsuario.get(row.user_id) ?? 0) + 1)
    }
    if (!data || data.length < 1000) break
  }
  return porUsuario
}

async function apagados(admin: SupabaseClient, clave: string): Promise<string[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq(`notification_preferences->>${clave}`, 'false')
    .limit(10000)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { id: string }[]).map(r => r.id)
}

// ── Modo deslizar ──────────────────────────────────────────────────────────

const ACCIONES = [
  { accion: 'me_gusto', nombre: 'Me gustó' },
  { accion: 'no_me_gusto', nombre: 'No me gustó' },
  { accion: 'quiero_verla', nombre: 'Quiero verla' },
  { accion: 'pasar', nombre: 'Pasar' },
]

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

function deslizar(evs: Evento[]): MedicionApp['deslizar'] {
  const abiertos = evs.filter(e => e.name === 'deslizar_abierto')
  const acciones = evs.filter(e => e.name === 'deslizar_accion')
  const deshechas = evs.filter(e => e.name === 'deslizar_deshacer')

  const origenes = [...new Set(['home', 'que_ver', ...abiertos.map(e => String(prop(e, 'origen') ?? 'desconocido'))])]
  const aperturas = origenes.map(origen => {
    const de = abiertos.filter(e => String(prop(e, 'origen') ?? 'desconocido') === origen)
    return { origen, veces: de.length, personas: personas(de) }
  })

  // Tarjetas por persona: sus acciones menos las que deshizo, sobre todos los
  // que entraron (los que entraron y no pasaron ninguna cuentan como cero).
  const tarjetas = new Map<string, number>()
  for (const e of abiertos) tarjetas.set(e.anon_id, tarjetas.get(e.anon_id) ?? 0)
  for (const e of acciones) tarjetas.set(e.anon_id, (tarjetas.get(e.anon_id) ?? 0) + 1)
  for (const e of deshechas) tarjetas.set(e.anon_id, Math.max(0, (tarjetas.get(e.anon_id) ?? 0) - 1))
  const valores = [...tarjetas.values()]

  return {
    desde: rango(evs).desde,
    aperturas,
    personas: valores.length,
    tarjetasPromedio: valores.length > 0
      ? Math.round((valores.reduce((s, n) => s + n, 0) / valores.length) * 10) / 10
      : null,
    tarjetasMediana: mediana(valores),
    acciones: ACCIONES.map(({ accion, nombre }) => {
      const veces = acciones.filter(e => prop(e, 'accion') === accion).length
      return { accion, nombre, veces, pct: pct(veces, acciones.length) }
    }),
    deshechas: deshechas.length,
  }
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/app-medicion')
  if (failure) return failure

  try {
    const [onb, recos, push, desl, porUsuario, uso, perfiles, ...apagadosPor] = await Promise.all([
      eventos(admin, ['onboarding_step_viewed', 'onboarding_skipped']),
      pantallasRecomendaciones(admin),
      eventos(admin, ['push_ofrecido', 'push_aceptado', 'push_ahora_no', 'push_ajustes_abiertos', 'push_activado']),
      eventos(admin, ['deslizar_abierto', 'deslizar_accion', 'deslizar_deshacer']),
      tokens(admin),
      admin.rpc('admin_app_uso'),
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      ...INTERRUPTORES.map(i => apagados(admin, i.clave)),
    ])

    if (uso.error) console.error('[admin/app-medicion] admin_app_uso:', uso.error.message)
    const fila = (uso.data as { activas: number; con_sesion: number; desde: string | null }[] | null)?.[0]

    const medicion: MedicionApp = {
      onboarding: embudos(onb, recos),
      notificaciones: {
        permisoDesde: rango(push).desde,
        permiso: permiso(push),
        recordatorio: recordatorio(push),
        usuariosConToken: porUsuario.size,
        aparatosConToken: [...porUsuario.values()].reduce((s, n) => s + n, 0),
        instalacionesActivas: fila ? Number(fila.activas) : null,
        instalacionesConSesion: fila ? Number(fila.con_sesion) : null,
        instalacionesDesde:
          fila?.desde && Date.now() - new Date(fila.desde).getTime() < VIGENCIA_MS ? fila.desde : null,
        perfiles: perfiles.count ?? 0,
        interruptores: INTERRUPTORES.map((i, n) => ({
          ...i,
          apagados: apagadosPor[n].length,
          apagadosConToken: apagadosPor[n].filter(id => porUsuario.has(id)).length,
        })),
      },
      deslizar: deslizar(desl),
    }
    return NextResponse.json(medicion)
  } catch (err) {
    console.error('[admin/app-medicion]', (err as Error).message)
    return NextResponse.json({ message: (err as Error).message }, { status: 500 })
  }
}
