import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'
import { precalculado, FRESCO_RAPIDO } from '@/lib/admin-precalculado'

/**
 * GET /api/admin/app-medicion — lo nuevo de la app en `/admin/metricas`.
 *
 *   · Embudo de onboarding por flujo: el corto (props.flujo = 'corto') y el
 *     viejo (sin flujo), de la app y de la web por separado.
 *   · Notificaciones: el pedido de permiso por origen, cuántos tienen token y
 *     cuántos apagaron cada interruptor.
 *   · Modo deslizar: aperturas por origen, tarjetas por persona y acciones.
 *   · Anuncios por lugar (desde la 1.0.16): cargados (`ad_cargado` con
 *     `ubicacion`) contra los pedidos que fallaron (`client_errors`
 *     `ads.load`, con la ubicación en el contexto), en los últimos 30 días.
 *
 * Todo sale de `analytics_events` sin bots, salvo los tokens (`user_devices`),
 * las instalaciones (`admin_app_uso`, la misma definición que el resumen) y
 * los interruptores (`profiles.notification_preferences`), que son la foto de
 * hoy. Una "persona" es un `anon_id`: una instalación de la app o un
 * navegador. Cada bloque devuelve desde cuándo hay datos.
 *
 * Los conteos sobre `analytics_events` y `client_errors` los hace
 * `admin_app_medicion()` en la base (`supabase-panel-app-2026-10.sql`) y
 * pg_cron los deja calculados cada 10 minutos: bajar los eventos de a 1000
 * filas se cortaba por tiempo desde el 26/10. Acá se les ponen los nombres y
 * el orden.
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

/**
 * Un camino por el que se pide el permiso de notificaciones (`origen` de los
 * eventos push_*): el onboarding y, desde la 1.0.16, los momentos en contexto.
 */
export interface CaminoPermiso {
  clave: string
  nombre: string
  vieron: number
  /** Tocaron "Activar" (o "Que suenen", o "Abrir ajustes" si estaba bloqueado). */
  tocaron: number
  /** Terminaron con el permiso dado (y el token guardado, desde la 1.0.16). */
  activaron: number
  ahoraNo: number
  /** Lo vieron y no tocaron nada: ni activar ni "Ahora no". */
  sinResponder: number
}

/** iPhone: el permiso provisional (llegan calladas, sin preguntar). */
export interface Provisional {
  loTienen: number
  normales: number
  desactivadas: number
}

export interface MedicionApp {
  onboarding: EmbudoOnboarding[]
  notificaciones: {
    permisoDesde: string | null
    caminos: CaminoPermiso[]
    provisional: Provisional
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
  anuncios: {
    /** El primer `ad_cargado` con ubicación de la ventana. */
    desde: string | null
    lugares: AnuncioLugar[]
    /** Cargados sin ubicación: versiones de la app anteriores a la 1.0.16. */
    sinLugar: number
  }
}

export interface AnuncioLugar {
  ubicacion: string
  nombre: string
  cargados: number
  android: number
  ios: number
  sinRelleno: number
  /** Otros fallos: timeout, error de red, pedido inválido. */
  errores: number
  /** Cargados sobre pedidos (cargados + sin relleno + errores). */
  pct: number | null
}

// ── Lo que devuelve admin_app_medicion() ───────────────────────────────────

interface Sql {
  onboarding: {
    flujo: EmbudoOnboarding['clave']
    desde: string | null
    ultimo: string | null
    /** Personas que vieron "Tus primeras recomendaciones" (sólo los cortos). */
    recos: number
    saltos_sin_paso: number
    pasos: { paso: string | null; vieron: number; saltearon: number }[]
  }[]
  notificaciones: {
    desde: string | null
    /** En el orden en que apareció cada camino. */
    caminos: {
      camino: string; vieron: number; tocaron: number; activaron: number; ahora_no: number; sin_responder: number
    }[]
    provisional: Provisional
  }
  deslizar: {
    desde: string | null
    aperturas: { origen: string; veces: number; personas: number }[]
    personas: number
    tarjetasPromedio: number | null
    tarjetasMediana: number | null
    acciones: Record<string, number>
    totalAcciones: number
    deshechas: number
  }
  /** Últimos 30 días. */
  anuncios: {
    desde: string | null
    sinLugar: number
    cargados: { ubicacion: string; cargados: number; android: number; ios: number }[]
    fallos: { ubicacion: string; total: number; sin_relleno: number }[]
  }
}

const pct = (n: number, de: number): number | null => (de > 0 ? Math.round((n / de) * 1000) / 10 : null)
const num = (v: number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v))

/** Falta correr `supabase-panel-app-2026-10.sql`. */
function faltaLaFuncion(error: { code?: string; message?: string }): boolean {
  if (error.code === '42883' || error.code === 'PGRST202') return true
  return (error.message ?? '').toLowerCase().includes('could not find the function')
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

/**
 * El SQL arma los mismos cuatro flujos: el corto o el viejo según
 * `props.flujo`, de la app o de la web según `platform`. La cantidad de pasos
 * de cada uno está repetida ahí, para contar los saltos sin paso.
 */
function embudos(filas: Sql['onboarding']): EmbudoOnboarding[] {
  const salida: EmbudoOnboarding[] = []
  for (const flujo of FLUJOS) {
    const fila = filas.find(f => f.flujo === flujo.clave)
    const desde = fila?.desde ?? null
    const ultimo = fila?.ultimo ?? null
    const vigente = ultimo !== null && Date.now() - new Date(ultimo).getTime() < VIGENCIA_MS
    // Los flujos nuevos van siempre, aunque estén vacíos: son los que hay que mirar.
    if (!CORTOS.includes(flujo.clave) && !vigente) continue

    const pasos: PasoEmbudo[] = flujo.pasos.map((nombre, i) => {
      const paso = fila?.pasos.find(p => Number(p.paso) === i + 1)
      return { nombre, personas: Number(paso?.vieron ?? 0), pct: null, saltearon: Number(paso?.saltearon ?? 0) }
    })
    if (CORTOS.includes(flujo.clave)) {
      pasos.push({ nombre: 'Vio sus recomendaciones', personas: Number(fila?.recos ?? 0), pct: null, saltearon: 0 })
    }
    const base = pasos[0]?.personas ?? 0
    for (const p of pasos) p.pct = pct(p.personas, base)

    salida.push({
      clave: flujo.clave,
      titulo: flujo.titulo,
      desde,
      ultimo,
      pasos,
      saltosSinPaso: Number(fila?.saltos_sin_paso ?? 0),
    })
  }
  return salida
}

// ── Notificaciones ─────────────────────────────────────────────────────────

/** En el orden en que se muestran. Los que no están acá salen al final. */
const CAMINOS: Record<string, string> = {
  onboarding: 'Onboarding',
  watchlist: 'Al guardar en Ver después',
  famoso: 'Al seguir a un famoso',
  calificaciones: 'En la 3.ª calificación',
  regreso: 'Al volver después de días',
  follow: 'Al seguir a un usuario',
}

/**
 * El camino lo saca el SQL: el `origen` de los eventos push_*, salvo los
 * builds de prueba de la 1.0.16, que mandaban `origen: 'recordatorio'` con el
 * camino en `momento`.
 */
function caminos(filas: Sql['notificaciones']['caminos']): CaminoPermiso[] {
  const claves = [...new Set([...Object.keys(CAMINOS), ...filas.map(f => f.camino)])]
  return claves.map(clave => {
    const f = filas.find(c => c.camino === clave)
    return {
      clave,
      nombre: CAMINOS[clave] ?? clave,
      vieron: Number(f?.vieron ?? 0),
      tocaron: Number(f?.tocaron ?? 0),
      activaron: Number(f?.activaron ?? 0),
      ahoraNo: Number(f?.ahora_no ?? 0),
      sinResponder: Number(f?.sin_responder ?? 0),
    }
  })
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
  const ids: string[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq(`notification_preferences->>${clave}`, 'false')
      .order('id', { ascending: true })
      .range(desde, desde + 999)
    if (error) throw new Error(error.message)
    ids.push(...((data ?? []) as { id: string }[]).map(r => r.id))
    if (!data || data.length < 1000) break
  }
  return ids
}

// ── Modo deslizar ──────────────────────────────────────────────────────────

const ACCIONES = [
  { accion: 'me_gusto', nombre: 'Me gustó' },
  { accion: 'no_me_gusto', nombre: 'No me gustó' },
  { accion: 'quiero_verla', nombre: 'Quiero verla' },
  { accion: 'pasar', nombre: 'Pasar' },
]

/**
 * Tarjetas por persona (las cuenta el SQL): sus acciones menos las que
 * deshizo, sobre todos los que entraron (los que entraron y no pasaron
 * ninguna cuentan como cero).
 */
function deslizar(d: Sql['deslizar']): MedicionApp['deslizar'] {
  const origenes = [...new Set(['home', 'que_ver', ...d.aperturas.map(a => a.origen)])]
  return {
    desde: d.desde,
    aperturas: origenes.map(origen => {
      const a = d.aperturas.find(x => x.origen === origen)
      return { origen, veces: Number(a?.veces ?? 0), personas: Number(a?.personas ?? 0) }
    }),
    personas: Number(d.personas),
    tarjetasPromedio: num(d.tarjetasPromedio),
    tarjetasMediana: num(d.tarjetasMediana),
    acciones: ACCIONES.map(({ accion, nombre }) => {
      const veces = Number(d.acciones[accion] ?? 0)
      return { accion, nombre, veces, pct: pct(veces, Number(d.totalAcciones)) }
    }),
    deshechas: Number(d.deshechas),
  }
}

// ── Anuncios ───────────────────────────────────────────────────────────────

/** En el orden en que se muestran. Las que no están acá salen al final con su clave. */
const LUGARES: Record<string, string> = {
  ficha: 'Ficha de película o serie',
  busqueda: 'Búsqueda',
  inicio_arriba: 'Inicio, arriba (entre plataformas y Recomendado)',
  inicio: 'Inicio, abajo (después de las series)',
  persona: 'Ficha de un famoso',
  lista: 'Detalle de una lista',
  guia: 'Guías',
  comunidad: 'Comunidad',
  perfil: 'Perfil',
}

/**
 * Cargados (`ad_cargado`) contra fallos (`client_errors` `ads.load`) de los
 * últimos 30 días, ya contados por lugar en el SQL.
 */
function anuncios(d: Sql['anuncios']): MedicionApp['anuncios'] {
  // El diagnóstico de Ajustes no es un lugar de la app: no se cuenta.
  const lugar = (u: string) => u && u !== 'diagnostico'

  const claves = [...new Set([
    ...Object.keys(LUGARES),
    ...d.cargados.map(c => c.ubicacion),
    ...d.fallos.map(f => f.ubicacion),
  ])].filter(lugar)

  const lugares = claves.map(ubicacion => {
    const c = d.cargados.find(x => x.ubicacion === ubicacion)
    const f = d.fallos.find(x => x.ubicacion === ubicacion)
    const cargados = Number(c?.cargados ?? 0)
    const falla = Number(f?.total ?? 0)
    const sinRelleno = Number(f?.sin_relleno ?? 0)
    return {
      ubicacion,
      nombre: LUGARES[ubicacion] ?? ubicacion,
      cargados,
      android: Number(c?.android ?? 0),
      ios: Number(c?.ios ?? 0),
      sinRelleno,
      errores: falla - sinRelleno,
      pct: pct(cargados, cargados + falla),
    }
  })

  return { desde: d.desde, lugares, sinLugar: Number(d.sinLugar) }
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/app-medicion')
  if (failure) return failure

  try {
    const [conteos, porUsuario, uso, perfiles, ...apagadosPor] = await Promise.all([
      precalculado(admin, 'admin_app_medicion', FRESCO_RAPIDO, () => admin.rpc('admin_app_medicion')),
      tokens(admin),
      precalculado(admin, 'admin_app_uso', FRESCO_RAPIDO, () => admin.rpc('admin_app_uso')),
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      ...INTERRUPTORES.map(i => apagados(admin, i.clave)),
    ])

    if (conteos.error) {
      throw new Error(faltaLaFuncion(conteos.error)
        ? 'Falta correr supabase-panel-app-2026-10.sql.'
        : conteos.error.message)
    }
    const sql = conteos.data as Sql

    if (uso.error) console.error('[admin/app-medicion] admin_app_uso:', uso.error.message)
    const fila = (uso.data as { activas: number; con_sesion: number; desde: string | null }[] | null)?.[0]

    const medicion: MedicionApp = {
      onboarding: embudos(sql.onboarding ?? []),
      notificaciones: {
        permisoDesde: sql.notificaciones.desde,
        caminos: caminos(sql.notificaciones.caminos),
        provisional: {
          loTienen: Number(sql.notificaciones.provisional.loTienen),
          normales: Number(sql.notificaciones.provisional.normales),
          desactivadas: Number(sql.notificaciones.provisional.desactivadas),
        },
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
      deslizar: deslizar(sql.deslizar),
      anuncios: anuncios(sql.anuncios),
    }
    return NextResponse.json(medicion)
  } catch (err) {
    console.error('[admin/app-medicion]', (err as Error).message)
    return NextResponse.json({ message: (err as Error).message }, { status: 500 })
  }
}
