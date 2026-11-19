/**
 * Prueba "mail-1": un mail a usuarios que dejaron de entrar, con grupo de control.
 * Se corre a mano desde la carpeta del repo. Nada es automático.
 *
 * Antes de nada: correr supabase-mail-prueba-2026-11.sql en Supabase.
 *
 * ── 1. Modo de prueba (manda UN mail, sólo a hola@glynbox.com) ─────────────
 *
 *   npx -y tsx scripts/mail-prueba.ts prueba --reco=movie:550 --frase="Mi frase"
 *
 *   Arma el mail con los datos de un usuario (por defecto Ferlageok; otro con
 *   --como=<username>) y lo manda a hola@glynbox.com. No toca mail_prueba.
 *   El link de baja de la prueba no da de baja a nadie.
 *   --idioma=en         forzar el mail en inglés
 *   --frase-en="..."    la frase para quien tiene la app en inglés
 *   --asunto=1|2|3      cuál de los 3 asuntos (1 por defecto)
 *   --solo-html=a.html  no manda nada: guarda el HTML para mirarlo
 *
 * ── 2. Asignar los grupos (una sola vez; no manda nada) ────────────────────
 *
 *   npx -y tsx scripts/mail-prueba.ts asignar
 *
 *   600 al azar entre los elegibles: 300 "mail" y 300 "control".
 *   --por-grupo=300 --dias=14
 *
 * ── 3. Enviar a usuarios reales (de a 100 por corrida, un día por corrida) ─
 *
 *   npx -y tsx scripts/mail-prueba.ts enviar --reco=movie:550 --frase="..." --frase-en="..."
 *       → ensayo: dice a quién le tocaría y qué asunto, sin mandar nada.
 *   ... enviar --reco=... --frase=... --de-verdad
 *       → manda. Resend gratis permite 100 por día (los de prueba cuentan).
 *
 *   Por cada mail que sale, a un usuario del grupo control se le pone la
 *   misma hora: así los dos grupos se miden desde el mismo momento.
 *   --cantidad=100
 *
 * Usar la MISMA recomendación y frase en las 3 corridas: es la misma prueba.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import {
  armarContenido, armarMail, existeEnTmdb, linkBajaUnClic,
  type Campana, type Destinatario, type MediaType, type Recomendacion,
} from '../lib/mail-reenganche'

const PRUEBA = 'mail-1'
const DE = 'Fer de Glynbox <hola@glynbox.com>'
const RESPONDER_A = 'hola@glynbox.com'
const CASILLA_DE_PRUEBA = 'hola@glynbox.com'
const USUARIO_DE_PRUEBA = 'Ferlageok'
/** Resend gratis: 2 pedidos por segundo. */
const ENTRE_ENVIOS_MS = 650
/** Fuera del repo: lleva el nombre de un usuario real. */
const ENSAYO = join(tmpdir(), 'mail-prueba-ensayo.html')

// ── Entorno y argumentos ───────────────────────────────────────────────────

try {
  process.loadEnvFile(resolve(process.cwd(), '.env.local'))
} catch {
  console.error('No encontré .env.local: corré el script desde la carpeta del repo.')
  process.exit(1)
}

const [modo, ...resto] = process.argv.slice(2)
const args = new Map<string, string>()
for (const a of resto) {
  const m = /^--([^=]+)(?:=([\s\S]*))?$/.exec(a)
  if (m) args.set(m[1], m[2] ?? 'true')
}

function salir(msg: string): never {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

function supabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE
  if (!url || !key) salir('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE en .env.local.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function faltaElSql(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return ['42883', 'PGRST202', '42P01', 'PGRST205', '42703'].includes(error.code ?? '')
}

async function leerReco(): Promise<Recomendacion & { fraseEn?: string; titulo: string }> {
  const raw = args.get('reco')
  const frase = args.get('frase')?.trim()
  if (!raw || !frase || frase === 'true') {
    salir('Falta la recomendación: --reco=movie:<id de TMDB> (o tv:<id>) --frase="tu frase"')
  }
  const m = /^(?:(movie|tv):)?(\d+)$/.exec(raw)
  if (!m) salir('--reco tiene que ser movie:<id> o tv:<id> (sin tipo, película).')
  const mediaType = (m[1] ?? 'movie') as MediaType
  const id = Number(m[2])
  const titulo = await existeEnTmdb(mediaType, id)
  if (!titulo) salir(`TMDB no tiene ${mediaType}:${id}.`)
  const fraseEn = args.get('frase-en')?.trim()
  return { mediaType, id, frase, fraseEn: fraseEn && fraseEn !== 'true' ? fraseEn : undefined, titulo }
}

function leerAsunto(): 1 | 2 | 3 {
  const n = Number(args.get('asunto') ?? 1)
  if (n !== 1 && n !== 2 && n !== 3) salir('--asunto es 1, 2 o 3.')
  return n
}

/** Lo que vio, calificó o reseñó: no se le recomienda. */
async function vistos(db: SupabaseClient, userId: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (const tabla of ['watched', 'ratings', 'reviews']) {
    const { data, error } = await db.from(tabla).select('media_id, media_type').eq('user_id', userId).limit(5000)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    for (const f of (data ?? []) as { media_id: number; media_type: string }[]) out.add(`${f.media_type}:${f.media_id}`)
  }
  return out
}

// ── Resend ─────────────────────────────────────────────────────────────────

type Resultado =
  | { ok: true; id: string }
  | { ok: false; definitivo: boolean; cupo: boolean; mensaje: string }

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

async function mandar(p: {
  para: string
  asunto: string
  html: string
  texto: string
  bajaToken: string
  idempotencia: string
}): Promise<Resultado> {
  const key = process.env.RESEND_API_KEY
  if (!key) salir('Falta RESEND_API_KEY en .env.local.')
  const cuerpo = JSON.stringify({
    from: DE,
    to: [p.para],
    reply_to: RESPONDER_A,
    subject: p.asunto,
    html: p.html,
    text: p.texto,
    headers: {
      'List-Unsubscribe': `<${linkBajaUnClic(p.bajaToken)}>, <mailto:${RESPONDER_A}?subject=baja>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [{ name: 'campana', value: PRUEBA }],
  })

  for (let intento = 0; intento < 4; intento++) {
    let r: Response
    try {
      r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          // Si una corrida se corta y se repite, Resend no lo manda dos veces (24 h).
          'Idempotency-Key': p.idempotencia,
        },
        body: cuerpo,
      })
    } catch (e) {
      await espera(2000 * (intento + 1))
      if (intento === 3) return { ok: false, definitivo: false, cupo: false, mensaje: (e as Error).message }
      continue
    }
    const json = (await r.json().catch(() => ({}))) as { id?: string; name?: string; message?: string }
    if (r.ok && json.id) return { ok: true, id: json.id }
    const mensaje = `${r.status} ${json.name ?? ''}: ${json.message ?? ''}`.trim()
    if (r.status === 429 && /quota/i.test(`${json.name} ${json.message}`)) {
      return { ok: false, definitivo: false, cupo: true, mensaje }
    }
    if (r.status === 429 || r.status >= 500) {
      await espera(1500 * (intento + 1))
      if (intento === 3) return { ok: false, definitivo: false, cupo: false, mensaje }
      continue
    }
    // 4xx: el mail o el pedido están mal; reintentar no lo arregla.
    return { ok: false, definitivo: true, cupo: false, mensaje }
  }
  return { ok: false, definitivo: false, cupo: false, mensaje: 'sin respuesta' }
}

// ── Modos ──────────────────────────────────────────────────────────────────

async function modoPrueba() {
  const db = supabase()
  const reco = await leerReco()
  const campana: Campana = { nombre: `${PRUEBA}-prueba`, asunto: leerAsunto() }

  const username = args.get('como') ?? USUARIO_DE_PRUEBA
  const { data: perfil } = await db.from('profiles').select('id').eq('username', username).maybeSingle()
  if (!perfil) salir(`No hay un usuario "${username}".`)

  const { data, error } = await db.rpc('mail_prueba_perfil', { p_user_id: perfil.id })
  if (faltaElSql(error)) salir('Falta correr supabase-mail-prueba-2026-11.sql en Supabase.')
  if (error) salir(error.message)
  const fila = (data as Record<string, unknown>[])[0]
  if (!fila) salir('No se pudo leer el perfil.')

  const idioma = args.get('idioma') ?? (fila.idioma as string | null)
  const contenido = await armarContenido(
    { idioma, country: fila.country as string | null, favoritePlatforms: fila.favorite_platforms as string[] | null },
    await vistos(db, perfil.id),
    reco,
  )
  // Token y código "prueba": el link de baja no da de baja y las visitas
  // quedan como "mail-1-prueba", fuera de la medición.
  const mail = armarMail(contenido, { nombre: fila.nombre as string | null, codigo: 'prueba', bajaToken: 'prueba' }, campana)

  console.log(`\nCon los datos de ${username} (país ${contenido.pais}, idioma ${contenido.idioma}).`)
  console.log(`Asunto: ${mail.asunto}`)
  console.log(`Plataforma principal: ${contenido.principal ?? '— (ninguna de sus plataformas existe en su país)'}`)
  for (const t of contenido.titulos) console.log(`  · ${t.titulo} (${t.mediaType}:${t.id}) — ${t.plataforma}`)
  console.log(`  ★ ${contenido.reco?.titulo ?? '(la recomendación no se pudo leer)'} — ${contenido.reco?.plataforma ?? 'sin plataforma en su país'}`)
  if (contenido.titulos.length < 3) console.log(`  ⚠ Sólo ${contenido.titulos.length} títulos en sus plataformas.`)

  const archivo = args.get('solo-html')
  if (archivo) {
    writeFileSync(archivo, mail.html)
    console.log(`\nHTML guardado en ${resolve(archivo)}. No se mandó nada.\n`)
    return
  }

  const r = await mandar({
    para: CASILLA_DE_PRUEBA,
    asunto: `[PRUEBA] ${mail.asunto}`,
    html: mail.html,
    texto: mail.texto,
    bajaToken: 'prueba',
    idempotencia: `${PRUEBA}-prueba-${Date.now()}`,
  })
  if (!r.ok) salir(`Resend no lo aceptó: ${r.mensaje}`)
  console.log(`\n✔ Mandado a ${CASILLA_DE_PRUEBA} (id de Resend ${r.id}).\n`)
}

async function modoAsignar() {
  const db = supabase()
  const porGrupo = Number(args.get('por-grupo') ?? 300)
  const dias = Number(args.get('dias') ?? 14)
  const { data, error } = await db.rpc('mail_prueba_asignar', { p_prueba: PRUEBA, p_por_grupo: porGrupo, p_dias: dias })
  if (faltaElSql(error)) salir('Falta correr supabase-mail-prueba-2026-11.sql en Supabase.')
  if (error) salir(error.message)
  console.log(`\nGrupos de ${PRUEBA}:`)
  for (const f of (data ?? []) as { grupo: string; cantidad: number }[]) console.log(`  ${f.grupo}: ${f.cantidad}`)
  console.log('\nNo se mandó nada.\n')
}

async function modoEnviar() {
  const db = supabase()
  const deVerdad = args.get('de-verdad') === 'true'
  const reco = await leerReco()
  const campana: Campana = { nombre: PRUEBA, asunto: leerAsunto() }
  const cantidad = Math.min(100, Math.max(1, Number(args.get('cantidad') ?? 100)))

  const { data, error } = await db.rpc('mail_prueba_destinatarios', { p_prueba: PRUEBA, p_limite: cantidad })
  if (faltaElSql(error)) salir('Falta correr supabase-mail-prueba-2026-11.sql en Supabase.')
  if (error) salir(error.message)
  const destinatarios: Destinatario[] = ((data ?? []) as Record<string, unknown>[]).map(f => ({
    userId: f.user_id as string,
    email: f.email as string,
    nombre: f.nombre as string | null,
    idioma: f.idioma as string | null,
    country: f.country as string | null,
    favoritePlatforms: f.favorite_platforms as string[] | null,
    codigo: f.codigo as string,
    bajaToken: f.baja_token as string,
  }))
  if (destinatarios.length === 0) {
    console.log(`\nNo queda nadie del grupo "mail" de ${PRUEBA} por mandar (¿corriste "asignar"?).\n`)
    return
  }
  if (destinatarios.some(d => d.idioma?.toLowerCase().startsWith('en')) && !reco.fraseEn) {
    console.log('⚠ Hay destinatarios en inglés y no pasaste --frase-en: les va tu frase en castellano.')
  }

  console.log(`\n${deVerdad ? 'Mandando' : 'Ensayo (no se manda nada)'}: ${destinatarios.length} de ${PRUEBA}. Recomendación: ${reco.titulo}.\n`)
  const inicio = new Date().toISOString()
  let enviados = 0
  let fallidos = 0
  let pendientes = 0

  for (const [i, d] of destinatarios.entries()) {
    const n = `${String(i + 1).padStart(3)}/${destinatarios.length}`
    let mail: ReturnType<typeof armarMail>
    let titulos: number
    try {
      const contenido = await armarContenido(d, await vistos(db, d.userId), reco)
      mail = armarMail(contenido, d, campana)
      titulos = contenido.titulos.length
    } catch (e) {
      console.log(`${n}  ✖ no se pudo armar (${(e as Error).message}); queda pendiente`)
      pendientes++
      continue
    }
    if (!deVerdad) {
      console.log(`${n}  ${mail.asunto}${titulos < 3 ? `  ⚠ ${titulos} títulos` : ''}`)
      if (i === 0) writeFileSync(ENSAYO, mail.html)
      continue
    }

    const r = await mandar({
      para: d.email, asunto: mail.asunto, html: mail.html, texto: mail.texto,
      bajaToken: d.bajaToken, idempotencia: `${PRUEBA}/${d.userId}`,
    })
    if (r.ok) {
      const { error: e } = await db.from('mail_prueba')
        .update({ enviado_at: new Date().toISOString(), resend_id: r.id, error: null })
        .eq('prueba', PRUEBA).eq('user_id', d.userId)
      if (e) console.log(`${n}  ⚠ salió pero no se pudo guardar: ${e.message}`)
      enviados++
      console.log(`${n}  ✔ ${mail.asunto}`)
    } else if (r.cupo) {
      console.log(`${n}  ■ Se acabó el cupo de Resend (${r.mensaje}). El resto queda para otra corrida.`)
      pendientes += destinatarios.length - i
      break
    } else if (r.definitivo) {
      await db.from('mail_prueba').update({ error: r.mensaje.slice(0, 500) }).eq('prueba', PRUEBA).eq('user_id', d.userId)
      fallidos++
      console.log(`${n}  ✖ ${r.mensaje}`)
    } else {
      pendientes++
      console.log(`${n}  … ${r.mensaje}; queda pendiente`)
    }
    await espera(ENTRE_ENVIOS_MS)
  }

  if (!deVerdad) {
    console.log(`\nEnsayo terminado. El primer mail quedó en ${ENSAYO}.`)
    console.log('Para mandar de verdad, agregá --de-verdad.\n')
    return
  }

  // Tantos del control como mails salieron, con la hora de la corrida.
  if (enviados > 0) {
    const { data: control, error: e1 } = await db.from('mail_prueba')
      .select('user_id').eq('prueba', PRUEBA).eq('grupo', 'control').is('enviado_at', null)
      .order('orden').limit(enviados)
    const ids = ((control ?? []) as { user_id: string }[]).map(f => f.user_id)
    const { error: e2 } = ids.length
      ? await db.from('mail_prueba').update({ enviado_at: inicio }).eq('prueba', PRUEBA).in('user_id', ids)
      : { error: null }
    if (e1 || e2) console.log(`⚠ No se pudo marcar el grupo control: ${(e1 ?? e2)!.message}`)
    else console.log(`\nControl: ${ids.length} marcados con la hora de esta corrida.`)
  }
  console.log(`\nEnviados ${enviados} · rechazados ${fallidos} · pendientes ${pendientes}.\n`)
}

// ── ────────────────────────────────────────────────────────────────────────

const modos: Record<string, () => Promise<void>> = { prueba: modoPrueba, asignar: modoAsignar, enviar: modoEnviar }
const correr = modos[modo ?? '']
if (!correr) {
  salir('Uso: npx -y tsx scripts/mail-prueba.ts prueba|asignar|enviar [opciones]. Ver el comentario de arriba del archivo.')
}
correr().catch(e => salir((e as Error).message))
