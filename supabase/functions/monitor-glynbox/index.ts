// Edge Function de Supabase: el monitor contra robots y gastos de más.
// Ver supabase-monitor-2026-11.sql.
//
// La llama pg_cron (`glynbox-monitor`) a las 8:00, 15:00 y 22:00 de Buenos
// Aires, con el secreto de Vault en `x-monitor-secret`:
//
//   POST /functions/v1/monitor-glynbox   {}                  chequeo normal
//                                        { "prueba": true }  mide y devuelve, sin guardar ni avisar
//                                        { "probar_push": true }  manda un push de prueba
//
// Revisa:
//   · Vercel — gasto del ciclo contra el crédito de 20 USD (cargos diarios de
//     /v1/billing/charges, proyectado con los últimos 2 días cerrados), pedidos
//     de las últimas 3 horas y funciones de la última media hora (/metrics/v1)
//     contra la misma franja horaria de los 7 días anteriores. Lo que frena el
//     firewall (deny, challenge) no cuenta como tráfico: va aparte.
//   · Lo nuestro — ráfagas y proporción de bots (`monitor_metricas_propias`)
//     e inicios de sesión fallidos de Supabase Auth (logs, Management API).
//
// Si algo se dispara, un push a la app de fd_lage y Ferlageok (Expo, igual que
// lib/expo-push.ts). Cada alerta tiene una clave y no se repite antes de 8 h.
// Si hay un robot, la primera línea dice si lo frena el firewall o si pasa.
// Cada chequeo queda en `monitor_chequeos`; el Resumen del panel muestra el
// último.
//
// Se despliega sin verificación de JWT. Secretos: VERCEL_TOKEN (Vercel →
// Account Settings → Tokens, con alcance al equipo) y SB_ACCESS_TOKEN (token
// de acceso de Supabase, para leer los logs). SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY los pone Supabase.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

// ── Constantes ─────────────────────────────────────────────────────────────

const VERCEL_TEAM = 'team_o19NCHtx0lh0ZUhXhJQHkNMN'
const VERCEL_PROJECT = 'prj_vJe20ORkSYiMjkoG6lABTmB5ryqD'
const SUPABASE_REF = 'ddoqsdgiggkhbsulxncs'

/** El ciclo de facturación de Vercel arranca el 9 de cada mes. */
const DIA_DEL_CICLO = 9
/** Crédito de uso incluido en Pro, por ciclo. */
const CREDITO_USD = 20
/** Si el ciclo va a cerrar arriba de esto, alerta. */
const TOPE_PROYECCION_USD = 22
/** "Más del doble de lo normal". */
const FACTOR_PICO = 2
/** Días cerrados con los que se calcula el ritmo de gasto. */
const DIAS_RITMO = 2
/**
 * Lo normal de pedidos y funciones sale de la misma franja horaria de los 7
 * días anteriores (de noche hay más tráfico que de día). Un chequeo viejo
 * cuenta como "la misma franja" si se hizo a esta hora ± 90 minutos.
 */
const DIAS_FRANJA = 7
const TOLERANCIA_FRANJA_HORAS = 1.5
/**
 * Lo que el firewall rechaza o traba con desafío (Bot Protection, Challenge,
 * límite de pedidos) no llega a las funciones ni se cobra como uso: no cuenta
 * como tráfico, sólo se informa.
 */
const ACCIONES_FRENADAS = new Set(['deny', 'challenge', 'rate_limit'])
/** Pedidos frenados por hora, como mínimo, para hablar de un robot frenado. */
const UMBRAL_FRENADOS_HORA = 3000

/** Bots, en la ventana de 8 horas. */
const HORAS_BOTS = 8
const UMBRAL_RAFAGA = 30          // sesiones marcadas `rafaga:<país>`
const UMBRAL_BOTS_MIN = 100       // sesiones de bots, como mínimo, para mirar la proporción
const UMBRAL_BOTS_PROPORCION = 0.5

/**
 * Inicios de sesión fallidos en 8 h. Lo normal (19 al 22/11/2026): entre 5 y
 * 30 por DÍA, y como mucho 7 seguidos desde una IP (alguien que no se
 * acuerda la contraseña).
 */
const UMBRAL_FALLIDOS_TOTAL = 30
const UMBRAL_FALLIDOS_IP = 15

const DESTINATARIOS = ['fd_lage', 'Ferlageok']
const SILENCIO_HORAS = 8

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

// ── Tipos ──────────────────────────────────────────────────────────────────

type Alerta = { clave: string; texto: string }
type Falla = { fuente: string; error: string }

type CargoVercel = {
  BilledCost: number
  EffectiveCost: number
  ChargeCategory: string
  ServiceName: string
  ConsumedQuantity: number | null
  ChargePeriodStart: string
  ChargePeriodEnd: string
}

type Dia = {
  dia: string
  completo: boolean
  uso: number          // USD de uso (sin la licencia Pro)
  cobrado: number      // USD cobrados aparte del crédito (todo, licencia incluida)
  invocaciones: number
  pedidos: number
}

// ── Utilidades ─────────────────────────────────────────────────────────────

const usd = (n: number) => `${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
const num = (n: number) => Math.round(n).toLocaleString('es-AR')
const veces = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
/** "2026-11-21" → "21/11". */
const ddmm = (dia: string) => `${dia.slice(8)}/${dia.slice(5, 7)}`

function mediana(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo, null, 2), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Fecha YYYY-MM-DD sumando días (en UTC, sin horas). */
function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Días entre dos fechas YYYY-MM-DD. */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

/** Inicio y fin (exclusivo) del ciclo de Vercel en curso, por la fecha de Buenos Aires. */
function cicloActual(): { inicio: string; fin: string } {
  const hoy = new Date(Date.now() - 3 * 3_600_000)
  let y = hoy.getUTCFullYear()
  let m = hoy.getUTCMonth() // 0-11
  if (hoy.getUTCDate() < DIA_DEL_CICLO) {
    m -= 1
    if (m < 0) { m = 11; y -= 1 }
  }
  const inicio = `${y}-${String(m + 1).padStart(2, '0')}-${String(DIA_DEL_CICLO).padStart(2, '0')}`
  const fy = m === 11 ? y + 1 : y
  const fm = m === 11 ? 0 : m + 1
  const fin = `${fy}-${String(fm + 1).padStart(2, '0')}-${String(DIA_DEL_CICLO).padStart(2, '0')}`
  return { inicio, fin }
}

// ── Vercel ─────────────────────────────────────────────────────────────────

async function vercel(token: string, ruta: string, init?: RequestInit): Promise<Response> {
  const sep = ruta.includes('?') ? '&' : '?'
  const res = await fetch(`https://api.vercel.com${ruta}${sep}teamId=${VERCEL_TEAM}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`${ruta.split('?')[0]} respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res
}

/**
 * Gasto del ciclo e invocaciones/pedidos por día, de los cargos diarios.
 *
 * Los cargos vienen en formato FOCUS, una fila por servicio y por día (el día
 * de Vercel arranca a las 00:00 de California). `EffectiveCost` es lo
 * consumido; `BilledCost`, lo que se cobra fuera del crédito. La licencia Pro
 * (0,65 USD por día) va aparte del uso: no cuenta para la proyección.
 *
 * La proyección usa el ritmo de los últimos 2 días cerrados. Un día cerrado
 * es "con robot" si tuvo más del doble de invocaciones que la mediana de los
 * 14 anteriores; si hubo alguno en el ciclo, se proyecta también con el ritmo
 * de los últimos 2 días sin robot (lo gastado se cuenta igual: ya se gastó).
 */
async function revisarGasto(token: string, alertas: Alerta[]) {
  const { inicio, fin } = cicloActual()
  // 30 días antes del ciclo, para tener lo normal de cada día y marcar robots.
  const desde = sumarDias(inicio, -30)
  const hasta = new Date(Date.now() + 86_400_000).toISOString()
  const res = await vercel(token, `/v1/billing/charges?from=${desde}T00:00:00.000Z&to=${hasta}`)
  const texto = await res.text()
  const filas = texto.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as CargoVercel)

  const ahora = Date.now()
  const porDia = new Map<string, Dia>()
  for (const f of filas) {
    const dia = f.ChargePeriodStart.slice(0, 10)
    const d = porDia.get(dia) ?? {
      dia, completo: Date.parse(f.ChargePeriodEnd) <= ahora, uso: 0, cobrado: 0, invocaciones: 0, pedidos: 0,
    }
    if (f.ChargeCategory === 'Usage') d.uso += f.EffectiveCost
    d.cobrado += f.BilledCost
    if (f.ServiceName === 'Function Invocations') d.invocaciones += f.ConsumedQuantity ?? 0
    if (f.ServiceName === 'CDN Requests') d.pedidos += f.ConsumedQuantity ?? 0
    porDia.set(dia, d)
  }
  const dias = [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia))
  const todosCompletos = dias.filter((d) => d.completo)
  const delCiclo = dias.filter((d) => d.dia >= inicio && d.dia < fin)
  const completos = delCiclo.filter((d) => d.completo)

  // Días con robot: más del doble de invocaciones que la mediana de los 14
  // anteriores (con al menos 7 para comparar).
  const conRobot = new Set<string>()
  todosCompletos.forEach((d, i) => {
    const previos = todosCompletos.slice(Math.max(0, i - 14), i)
    const base = previos.length >= 7 ? mediana(previos.map((p) => p.invocaciones)) : null
    if (base && d.invocaciones > FACTOR_PICO * base) conRobot.add(d.dia)
  })
  const robotEnCiclo = completos.filter((d) => conRobot.has(d.dia)).map((d) => d.dia)

  const promedio = (ds: Dia[]) => (ds.length ? ds.reduce((s, d) => s + d.uso, 0) / ds.length : 0)
  const totalDias = diasEntre(inicio, fin)
  const faltan = totalDias - completos.length
  const gastado = delCiclo.reduce((s, d) => s + d.uso, 0)
  const gastadoCompletos = completos.reduce((s, d) => s + d.uso, 0)
  const cobrado = delCiclo.reduce((s, d) => s + d.cobrado, 0)
  const diasRitmo = todosCompletos.slice(-DIAS_RITMO)
  const ritmo = promedio(diasRitmo)
  const proyeccion = gastadoCompletos + ritmo * faltan
  const diasSinRobot = todosCompletos.filter((d) => !conRobot.has(d.dia)).slice(-DIAS_RITMO)
  const ritmoSinRobot = robotEnCiclo.length ? promedio(diasSinRobot) : null
  const proyeccionSinRobot = ritmoSinRobot !== null ? gastadoCompletos + ritmoSinRobot * faltan : null
  const esperadoALaFecha = (CREDITO_USD * completos.length) / totalDias
  const ritmoEsperado = CREDITO_USD / totalDias

  if (proyeccion > TOPE_PROYECCION_USD) {
    const sinRobot =
      proyeccionSinRobot !== null
        ? ` Sin contar los días con robot (${robotEnCiclo.map(ddmm).join(', ')}): ` +
          `${usd(ritmoSinRobot!)} por día y el ciclo cerraría en ${usd(proyeccionSinRobot)}.`
        : ''
    alertas.push({
      clave: 'vercel-gasto',
      texto:
        `Vercel: al ritmo de los últimos ${diasRitmo.length} días cerrados (${usd(ritmo)} por día, lo esperado es ${usd(ritmoEsperado)}) ` +
        `el ciclo cierra en ${usd(proyeccion)} (el crédito es de ${CREDITO_USD}). ` +
        `Van ${usd(gastadoCompletos)} en ${completos.length} días cerrados (lo esperado a esta altura: ${usd(esperadoALaFecha)}).` +
        sinRobot,
    })
  }
  if (cobrado >= 0.01) {
    alertas.push({
      clave: 'vercel-cobro',
      texto: `Vercel ya cobró ${usd(cobrado)} aparte del crédito en este ciclo (desde el ${inicio.slice(8)}/${inicio.slice(5, 7)}).`,
    })
  }

  // Invocaciones del último día completo contra la mediana de los 14 anteriores.
  const ayer = todosCompletos.at(-1)
  const previos = todosCompletos.slice(-15, -1)
  const baseInvocaciones = mediana(previos.map((d) => d.invocaciones))
  const basePedidos = mediana(previos.map((d) => d.pedidos))
  if (ayer && baseInvocaciones && ayer.invocaciones > FACTOR_PICO * baseInvocaciones) {
    alertas.push({
      clave: 'vercel-invocaciones-dia',
      texto:
        `Vercel: ${num(ayer.invocaciones)} invocaciones de funciones el ${ddmm(ayer.dia)}, ` +
        `${veces(ayer.invocaciones / baseInvocaciones)} veces lo normal (${num(baseInvocaciones)} por día).`,
    })
  }

  return {
    ciclo: { inicio, fin, dias: totalDias, dias_completos: completos.length },
    gastado_usd: +gastado.toFixed(3),
    cobrado_usd: +cobrado.toFixed(3),
    dias_del_ritmo: diasRitmo.map((d) => d.dia),
    ritmo_usd_dia: +ritmo.toFixed(3),
    ritmo_esperado_usd_dia: +ritmoEsperado.toFixed(3),
    esperado_a_la_fecha_usd: +esperadoALaFecha.toFixed(3),
    proyeccion_usd: +proyeccion.toFixed(3),
    dias_con_robot_en_el_ciclo: robotEnCiclo,
    dias_del_ritmo_sin_robot: ritmoSinRobot !== null ? diasSinRobot.map((d) => d.dia) : null,
    ritmo_sin_robot_usd_dia: ritmoSinRobot !== null ? +ritmoSinRobot.toFixed(3) : null,
    proyeccion_sin_robot_usd: proyeccionSinRobot !== null ? +proyeccionSinRobot.toFixed(3) : null,
    ultimo_dia: ayer ? { dia: ayer.dia, invocaciones: ayer.invocaciones, pedidos: ayer.pedidos, uso_usd: +ayer.uso.toFixed(3) } : null,
    base_invocaciones_dia: baseInvocaciones,
    base_pedidos_dia: basePedidos,
  }
}

/** Una consulta a /metrics/v1. Las fechas tienen que ir en segundos enteros. */
async function metrica(
  token: string,
  metric: string,
  desdeMs: number,
  hastaMs: number,
  groupBy?: string[]
): Promise<{ dimensions: Record<string, string>; values: Record<string, number> }[]> {
  const seg = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString()
  const res = await vercel(token, '/metrics/v1', {
    method: 'POST',
    body: JSON.stringify({
      metrics: { v: { metric, aggregation: 'count' } },
      ...(groupBy ? { groupBy } : {}),
      scope: { ownerId: VERCEL_TEAM, projectIds: [VERCEL_PROJECT] },
      timeRange: { start: seg(desdeMs), end: seg(hastaMs) },
    }),
  })
  const j = (await res.json()) as { summary?: { dimensions: Record<string, string>; values: Record<string, number> }[] }
  return j.summary ?? []
}

/** Pedidos por acción del firewall → los que pasan y los frenados, por hora. */
function separarAcciones(acciones: Record<string, number>, horas: number) {
  let pasan = 0
  let frenados = 0
  for (const [accion, n] of Object.entries(acciones)) {
    if (ACCIONES_FRENADAS.has(accion)) frenados += n
    else pasan += n
  }
  return { pasan: pasan / horas, frenados: frenados / horas }
}

async function pedidosPorAccion(token: string, desdeMs: number, hastaMs: number) {
  const filas = await metrica(token, 'vercel.request.count', desdeMs, hastaMs, ['wafAction'])
  const acciones: Record<string, number> = {}
  for (const f of filas) acciones[f.dimensions.wafAction || 'ninguna'] = f.values.v ?? 0
  return acciones
}

type TraficoGuardado = { pedidos_3h_por_accion?: Record<string, number>; funciones_hora?: number }

/**
 * Pedidos de las últimas 3 horas y funciones de la última media hora,
 * contra la misma franja horaria de los 7 días anteriores.
 *
 * Sin Observability Plus, /metrics/v1 deja mirar 24 h de pedidos (sin
 * filtros, pero sí agrupar) y sólo 30 minutos de funciones. Por eso lo normal
 * sale de:
 *   · pedidos: la misma franja de ayer, medida ahora (todavía entra en las
 *     24 h), y los chequeos del monitor de esta misma hora de hace 2 a 7 días;
 *   · funciones: los chequeos del monitor de esta misma hora de hace 1 a 7
 *     días (las de la métrica no se pueden comparar con las facturadas).
 *
 * Los pedidos que el firewall rechaza o traba con desafío no cuentan como
 * tráfico (no llegan a las funciones ni se cobran): se informan aparte.
 */
async function revisarTrafico(token: string, admin: SupabaseClient, alertas: Alerta[]) {
  const ahora = Date.now()
  const H = 3_600_000

  const acciones = await pedidosPorAccion(token, ahora - 3 * H, ahora)
  const { pasan: pedidosHora, frenados: frenadosHora } = separarAcciones(acciones, 3)
  const frenadosPorAccion = Object.fromEntries(
    Object.entries(acciones).filter(([a]) => ACCIONES_FRENADAS.has(a)).map(([a, n]) => [a, Math.round(n / 3)])
  )

  // La misma franja de ayer. Unos minutos de margen: la API rechaza lo que
  // arranque antes de 24 h atrás.
  const margen = 5 * 60_000
  const ayer = separarAcciones(await pedidosPorAccion(token, ahora - 24 * H + margen, ahora - 21 * H + margen), 3)

  const funciones = await metrica(token, 'vercel.function_invocation.count', ahora - 29 * 60_000, ahora)
  const funcionesHora = ((funciones[0]?.values.v ?? 0) * 60) / 29

  // Chequeos anteriores hechos a esta misma hora (± 90 min), de 1 a 7 días atrás.
  const { data: previos } = await admin
    .from('monitor_chequeos')
    .select('creado_en, datos')
    .gte('creado_en', new Date(ahora - (DIAS_FRANJA * 24 + 2) * H).toISOString())
    .lte('creado_en', new Date(ahora - 20 * H).toISOString())
    .order('creado_en', { ascending: false })
  const franja = (previos ?? []).flatMap((p: { creado_en: string; datos: { vercel_trafico?: TraficoGuardado } }) => {
    const horas = (ahora - Date.parse(p.creado_en)) / H
    const dias = Math.round(horas / 24)
    if (dias < 1 || dias > DIAS_FRANJA || Math.abs(horas - dias * 24) > TOLERANCIA_FRANJA_HORAS) return []
    const t = p.datos?.vercel_trafico
    return t ? [{ dias, t }] : []
  })

  const muestrasPedidos = [
    ayer,
    ...franja
      .filter((f) => f.dias >= 2 && f.t.pedidos_3h_por_accion)
      .map((f) => separarAcciones(f.t.pedidos_3h_por_accion!, 3)),
  ]
  const basePedidosHora = mediana(muestrasPedidos.map((m) => m.pasan))
  const baseFrenadosHora = mediana(muestrasPedidos.map((m) => m.frenados))

  const muestrasFunciones = franja
    .map((f) => f.t.funciones_hora)
    .filter((x): x is number => typeof x === 'number')
  const baseFunciones = muestrasFunciones.length >= 2 ? mediana(muestrasFunciones) : null

  const datoFrenados = `Aparte, el firewall frenó ${num(frenadosHora)} por hora (no se cobran como funciones).`

  if (basePedidosHora && pedidosHora > FACTOR_PICO * basePedidosHora) {
    alertas.push({
      clave: 'vercel-pedidos',
      texto:
        `Vercel: ${num(pedidosHora)} pedidos por hora pasaron el firewall en las últimas 3 h, ` +
        `${veces(pedidosHora / basePedidosHora)} veces lo normal a esta hora (${num(basePedidosHora)}). ${datoFrenados}`,
    })
  }

  if (baseFunciones && funcionesHora > FACTOR_PICO * baseFunciones) {
    alertas.push({
      clave: 'vercel-funciones',
      texto:
        `Vercel: ${num(funcionesHora)} invocaciones de funciones por hora en la última media hora, ` +
        `${veces(funcionesHora / baseFunciones)} veces lo normal a esta hora (${num(baseFunciones)}).`,
    })
  }

  const frenadosAltos =
    frenadosHora >= UMBRAL_FRENADOS_HORA && (!baseFrenadosHora || frenadosHora > FACTOR_PICO * baseFrenadosHora)

  return {
    pedidos_3h_por_accion: acciones,
    pedidos_hora: Math.round(pedidosHora),
    frenados_hora: Math.round(frenadosHora),
    frenados_hora_por_accion: frenadosPorAccion,
    frenados_altos: frenadosAltos,
    base_pedidos_hora: basePedidosHora !== null ? Math.round(basePedidosHora) : null,
    base_frenados_hora: baseFrenadosHora !== null ? Math.round(baseFrenadosHora) : null,
    muestras_pedidos: muestrasPedidos.length,
    funciones_hora: Math.round(funcionesHora),
    base_funciones_hora: baseFunciones !== null ? Math.round(baseFunciones) : null,
    muestras_funciones: muestrasFunciones.length,
  }
}

// ── Bots ───────────────────────────────────────────────────────────────────

type MetricasPropias = {
  horas: number
  sesiones_humanas: number
  sesiones_bot: number
  sesiones_rafaga: number
  rafaga_por_pais: Record<string, number>
  motivos_bot: Record<string, number>
  antes_humanas: number
  antes_bot: number
}

async function revisarBots(admin: SupabaseClient, alertas: Alerta[]) {
  const { data, error } = await admin.rpc('monitor_metricas_propias', { p_horas: HORAS_BOTS })
  if (error) throw new Error(`monitor_metricas_propias: ${error.message}`)
  const m = data as MetricasPropias

  const total = m.sesiones_humanas + m.sesiones_bot
  const proporcion = total ? m.sesiones_bot / total : 0
  const totalAntes = m.antes_humanas + m.antes_bot
  const proporcionAntes = totalAntes ? m.antes_bot / totalAntes : 0
  const pct = (x: number) => `${Math.round(x * 100)}%`

  if (m.sesiones_rafaga >= UMBRAL_RAFAGA) {
    const paises = Object.entries(m.rafaga_por_pais).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${num(n)}`).join(', ')
    alertas.push({
      clave: 'bots-rafaga',
      texto:
        `Ráfaga de bots: ${num(m.sesiones_rafaga)} visitas falsas en ${m.horas} h (${paises}). ` +
        `Ya salen de las métricas, pero cada una pasa por Vercel: si sigue, bloquear en el firewall.`,
    })
  }
  if (m.sesiones_bot >= UMBRAL_BOTS_MIN && proporcion > UMBRAL_BOTS_PROPORCION) {
    alertas.push({
      clave: 'bots-proporcion',
      texto:
        `${pct(proporcion)} de las sesiones de las últimas ${m.horas} h son de bots ` +
        `(${num(m.sesiones_bot)} contra ${num(m.sesiones_humanas)} de personas). Los 3 días anteriores: ${pct(proporcionAntes)}.`,
    })
  }

  return { ...m, proporcion_bot: +proporcion.toFixed(3), proporcion_bot_antes: +proporcionAntes.toFixed(3) }
}

// ── Supabase Auth ──────────────────────────────────────────────────────────

/**
 * Inicios de sesión fallidos de las últimas 8 h, de los logs de Auth.
 *
 * `auth.audit_log_entries` está vacía en este proyecto (no guarda nada en la
 * base), así que sólo están en los logs, que se leen con la Management API y
 * un token de acceso. Cuenta los POST /token con contraseña que volvieron 400
 * (contraseña mal, campos vacíos) o 429 (límite de intentos).
 */
async function revisarAuth(token: string, alertas: Alerta[]) {
  const fin = new Date()
  const inicio = new Date(fin.getTime() - HORAS_BOTS * 3_600_000)
  const sql = `
    SELECT log_attributes['remote_addr'] AS ip, count(*) AS n
    FROM logs
    WHERE source = 'auth_logs'
      AND log_attributes['msg'] = 'request completed'
      AND log_attributes['grant_type'] = 'password'
      AND log_attributes['status'] IN ('400', '429')
    GROUP BY ip
    ORDER BY n DESC
    LIMIT 50`
  const params = new URLSearchParams({
    sql,
    iso_timestamp_start: inicio.toISOString(),
    iso_timestamp_end: fin.toISOString(),
  })

  let ultimoError = ''
  for (const endpoint of ['logs', 'logs.all']) {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_REF}/analytics/endpoints/${endpoint}?${params}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(45_000) }
    )
    const cuerpo = await res.text()
    if (!res.ok) { ultimoError = `${endpoint} respondió ${res.status}: ${cuerpo.slice(0, 200)}`; continue }
    const j = JSON.parse(cuerpo) as { result?: { ip: string; n: number }[]; rows?: { ip: string; n: number }[]; error?: unknown }
    if (j.error) { ultimoError = `${endpoint}: ${JSON.stringify(j.error).slice(0, 200)}`; continue }
    const filas = (j.result ?? j.rows ?? []).map((f) => ({ ip: f.ip || '?', n: Number(f.n) || 0 }))
    const total = filas.reduce((s, f) => s + f.n, 0)
    const peor = filas[0]

    if (total > UMBRAL_FALLIDOS_TOTAL || (peor && peor.n >= UMBRAL_FALLIDOS_IP)) {
      alertas.push({
        clave: 'auth-fallidos',
        texto:
          `${num(total)} inicios de sesión fallidos en ${HORAS_BOTS} h desde ${filas.length} IP ` +
          `(lo normal: menos de 30 por día). La que más: ${peor?.ip} con ${num(peor?.n ?? 0)}.`,
      })
    }
    return { fallidos: total, ips: filas.length, top: filas.slice(0, 5), endpoint }
  }
  throw new Error(ultimoError)
}

// ── Push ───────────────────────────────────────────────────────────────────

async function mandarPush(admin: SupabaseClient, titulo: string, cuerpo: string): Promise<number> {
  const { data: perfiles, error: e1 } = await admin.from('profiles').select('id').in('username', DESTINATARIOS)
  if (e1) throw new Error(`profiles: ${e1.message}`)
  const ids = (perfiles ?? []).map((p: { id: string }) => p.id)
  if (ids.length === 0) return 0
  const { data: aparatos, error: e2 } = await admin.from('user_devices').select('push_token').in('user_id', ids)
  if (e2) throw new Error(`user_devices: ${e2.message}`)
  const tokens = [...new Set((aparatos ?? []).map((a: { push_token: string }) => a.push_token))]
  if (tokens.length === 0) return 0

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(
      tokens.map((to) => ({
        to, title: titulo, body: cuerpo, sound: 'default', channelId: 'default',
        data: { url: '/', type: 'monitor' },
      }))
    ),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Expo respondió ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = (await res.json()) as { data?: { status: string; message?: string }[] }
  const ok = (j.data ?? []).filter((t) => t.status === 'ok').length
  const malos = (j.data ?? []).filter((t) => t.status !== 'ok').map((t) => t.message)
  if (malos.length) console.error('[monitor] tickets con error:', malos)
  return ok
}

// ── Robot: frenado o pasando ───────────────────────────────────────────────

type Trafico = Awaited<ReturnType<typeof revisarTrafico>>

/**
 * Una línea para el principio del push: si hay un robot, ¿lo frena el
 * firewall o llega a las funciones?
 *   · pasando: los pedidos que pasan el firewall o las invocaciones están por
 *     arriba del doble de lo normal a esta hora;
 *   · frenado: hay señales de robot (ráfagas o bots en nuestras métricas, o
 *     muchos más pedidos frenados que lo normal) pero lo que pasa está normal.
 */
function estadoRobot(alertas: Alerta[], t: Trafico | undefined): { estado: 'pasando' | 'frenado' | 'no'; linea: string | null } {
  const claves = new Set(alertas.map((a) => a.clave))
  const pasando = claves.has('vercel-pedidos') || claves.has('vercel-funciones')
  if (pasando && t) {
    const base = t.base_pedidos_hora ? ` (${veces(t.pedidos_hora / t.base_pedidos_hora)} veces lo normal a esta hora)` : ''
    return {
      estado: 'pasando',
      linea: `🔴 Robot pasando: ${num(t.pedidos_hora)} pedidos/h llegan a las funciones${base}.`,
    }
  }
  const senales = claves.has('bots-rafaga') || claves.has('bots-proporcion') || t?.frenados_altos === true
  if (senales && !t) {
    return { estado: 'no', linea: '⚪ Robot detectado; no se pudo leer Vercel para saber si lo frena el firewall.' }
  }
  if (senales && t) {
    return {
      estado: 'frenado',
      linea: `🟢 Robot detectado pero frenado por el firewall: ${num(t.frenados_hora)} pedidos/h trabados, lo que pasa está normal (${num(t.pedidos_hora)}/h).`,
    }
  }
  return { estado: 'no', linea: null }
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'usar POST' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const secreto = req.headers.get('x-monitor-secret') ?? ''
  const { data: valido } = await admin.rpc('monitor_secreto_valido', { p_secreto: secreto })
  if (valido !== true) return json({ error: 'no autorizado' }, 401)

  let pedido: { prueba?: boolean; probar_push?: boolean } = {}
  try { pedido = await req.json() } catch { /* cuerpo vacío */ }

  if (pedido.probar_push) {
    const n = await mandarPush(admin, 'Glynbox: prueba del monitor', 'Si ves esto, las alertas del monitor te van a llegar.')
    return json({ push_enviados: n })
  }

  const alertas: Alerta[] = []
  const fallas: Falla[] = []
  const datos: Record<string, unknown> = {}

  // Sin espacios, saltos de línea ni comillas: un token pegado en Git Bash
  // en Windows puede traer un \r al final, y el header falla entero
  // ("failed to parse header value").
  // También las secuencias de escape de la terminal (ESC[200~ del pegado,
  // flechas…), que `read -s` deja dentro de la variable.
  const limpiar = (v: string | undefined) => v?.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[^\x21-\x7e]/g, '').replace(/^["']|["']$/g, '') || undefined
  const vercelToken = limpiar(Deno.env.get('VERCEL_TOKEN'))
  const sbToken = limpiar(Deno.env.get('SB_ACCESS_TOKEN'))

  const intentar = async (fuente: string, fn: () => Promise<unknown>) => {
    try {
      datos[fuente] = await fn()
    } catch (err) {
      fallas.push({ fuente, error: (err as Error).message })
    }
  }

  await Promise.all([
    (async () => {
      if (!vercelToken) { fallas.push({ fuente: 'vercel', error: 'falta el secreto VERCEL_TOKEN' }); return }
      await intentar('vercel_gasto', () => revisarGasto(vercelToken, alertas))
      await intentar('vercel_trafico', () => revisarTrafico(vercelToken, admin, alertas))
    })(),
    intentar('bots', () => revisarBots(admin, alertas)),
    (async () => {
      if (!sbToken) { fallas.push({ fuente: 'auth', error: 'falta el secreto SB_ACCESS_TOKEN' }); return }
      await intentar('auth', () => revisarAuth(sbToken, alertas))
    })(),
  ])

  // Una fuente que no se pudo leer también se avisa: un monitor roto en
  // silencio es peor que uno que se queja.
  const avisables: Alerta[] = [
    ...alertas,
    ...fallas.map((f) => ({ clave: `error-${f.fuente}`, texto: `El monitor no pudo revisar ${f.fuente}: ${f.error}` })),
  ]

  const estado = alertas.length ? 'alerta' : fallas.length ? 'error' : 'normal'
  const robot = estadoRobot(alertas, datos.vercel_trafico as Trafico | undefined)
  datos.robot = robot

  if (pedido.prueba) {
    // Cómo llegaron los tokens, sin mostrarlos: largo y caracteres fuera de [A-Za-z0-9_-].
    const forma = (v: string | undefined) => v === undefined ? null : { largo: v.length, raros: v.replace(/[A-Za-z0-9_-]/g, '').length }
    const tokens = { vercel_crudo: forma(Deno.env.get('VERCEL_TOKEN')), vercel: forma(vercelToken), sb: forma(sbToken) }
    return json({ estado, alertas, errores: fallas, datos, tokens })
  }

  // Las que ya salieron en las últimas 8 h no se repiten.
  const { data: recientes } = await admin
    .from('monitor_chequeos')
    .select('avisadas')
    .gte('creado_en', new Date(Date.now() - SILENCIO_HORAS * 3_600_000).toISOString())
  const yaAvisadas = new Set((recientes ?? []).flatMap((r: { avisadas: string[] }) => r.avisadas ?? []))
  const nuevas = avisables.filter((a) => !yaAvisadas.has(a.clave))

  let pushEnviados = 0
  let avisadas: string[] = []
  if (nuevas.length) {
    const titulo = nuevas.length === 1 ? 'Glynbox: alerta del monitor' : `Glynbox: ${nuevas.length} alertas del monitor`
    try {
      const lineas = nuevas.map((a) => `• ${a.texto}`)
      if (robot.linea) lineas.unshift(robot.linea)
      pushEnviados = await mandarPush(admin, titulo, lineas.join('\n'))
      // Si no llegó a ningún aparato, no se marca: se vuelve a intentar en el
      // próximo chequeo.
      if (pushEnviados > 0) avisadas = nuevas.map((a) => a.clave)
    } catch (err) {
      fallas.push({ fuente: 'push', error: (err as Error).message })
    }
  }

  const { error: errGuardar } = await admin.from('monitor_chequeos').insert({
    estado,
    alertas,
    avisadas,
    push_enviados: pushEnviados,
    datos,
    errores: fallas,
  })
  if (errGuardar) console.error('[monitor] no se pudo guardar el chequeo:', errGuardar.message)

  return json({ estado, alertas, avisadas, push_enviados: pushEnviados, errores: fallas, datos })
})
