// SERVER-ONLY — lee perfiles y tokens con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteDeadTokens, sendExpoPushMessages, type ExpoMessage } from './expo-push'
import { envioApagado, faltaLaTabla } from './push-envios'
import { idiomasDe, type Idioma } from './idioma'
import { rutaWrapped, WRAPPED_ABRE } from './wrapped'

/**
 * "Ya está tu resumen 2026 🎬": el aviso del Wrapped, el día que abre
 * (`WRAPPED_ABRE`, el 1 de diciembre) a las 19 de Argentina, a cada uno que
 * tiene Wrapped (`wrapped_destinatarios`: 5 o más vistas en el año, sin
 * "Ocultar actividad"). Al tocarla abre su Wrapped.
 *
 * Lo llama el cron de cada hora (`/api/cron/push-dia1`, pg_cron en punto),
 * así sale a las 19:00 y no "en algún momento de esa hora" como los crons de
 * Vercel. Fuera de la ventana —de las 19 a las 24 de ese día— no hace nada.
 *
 * Una sola vez por persona y año: antes de mandar se anota cada una en
 * `push_wrapped_enviados` (clave usuario + año) y sólo le sale a quien quedó
 * anotada en esta corrida. Si la de las 19 falla, la de las 20 manda lo que
 * falte. Respeta el interruptor del resumen semanal (`PREFERENCIA_DE`).
 *
 * Deja su fila en `push_envios` (tipo 'wrapped'), así el panel revisa los
 * recibos y anota los tokens de quien desinstaló, como con las demás.
 */

/** La hora de Argentina del aviso, el día que abre el Wrapped. */
export const WRAPPED_AVISO_HORA = 19

const HORA_MS = 60 * 60 * 1000

const TEXTOS: Record<Idioma, { titulo: (anio: number) => string; cuerpo: string }> = {
  es: { titulo: anio => `Ya está tu resumen ${anio} 🎬`, cuerpo: 'Mirá cuántas películas viste este año' },
  en: { titulo: anio => `Your ${anio} recap is here 🎬`, cuerpo: 'See how many movies you watched this year' },
}

/** El año cuyo aviso toca ahora, o `null` fuera de la ventana. */
export function anioDelAviso(ahora = Date.now()): number | null {
  const anio = new Date(ahora - 3 * HORA_MS).getUTCFullYear()
  const desde = new Date(`${anio}-${WRAPPED_ABRE}`).getTime() + WRAPPED_AVISO_HORA * HORA_MS
  const hasta = new Date(`${anio}-${WRAPPED_ABRE}`).getTime() + 24 * HORA_MS
  return ahora >= desde && ahora < hasta ? anio : null
}

export interface ResumenAvisoWrapped {
  anio: number | null
  saltada?: string
  envioId: number | null
  conWrapped: number
  sinAparato: number
  apagada: number
  yaAvisados: number
  personas: number
  mensajes: number
  enviados: number
  fallidos: number
  tokensBorrados: number
}

/**
 * `simular`: cuenta a quién le llegaría sin anotar ni mandar nada (con
 * `anio` se simula ese año a cualquier hora).
 */
export async function correrAvisoWrapped(
  admin: SupabaseClient,
  opciones: { ahora?: number; simular?: boolean; anio?: number } = {},
): Promise<ResumenAvisoWrapped> {
  const anio = opciones.simular && opciones.anio ? opciones.anio : anioDelAviso(opciones.ahora)
  const resumen: ResumenAvisoWrapped = {
    anio, envioId: null, conWrapped: 0, sinAparato: 0, apagada: 0, yaAvisados: 0,
    personas: 0, mensajes: 0, enviados: 0, fallidos: 0, tokensBorrados: 0,
  }
  if (anio == null) return { ...resumen, saltada: 'No es la hora del aviso del Wrapped.' }

  const { data: destinatarios, error } = await admin.rpc('wrapped_destinatarios', { p_anio: anio })
  if (error) throw new Error(`wrapped_destinatarios: ${error.message}`)
  const usuarios = new Map(((destinatarios ?? []) as { user_id: string; username: string }[]).map(d => [d.user_id, d.username]))
  resumen.conWrapped = usuarios.size

  const ids = [...usuarios.keys()]
  const tokens = new Map<string, string[]>()
  const apagados = new Set<string>()
  const avisados = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const tanda = ids.slice(i, i + 200)
    const [aparatos, perfiles, ya] = await Promise.all([
      admin.from('user_devices').select('user_id, push_token').in('user_id', tanda),
      admin.from('profiles').select('id, notification_preferences').in('id', tanda),
      admin.from('push_wrapped_enviados').select('user_id').eq('anio', anio).in('user_id', tanda),
    ])
    if (aparatos.error) throw new Error(`user_devices: ${aparatos.error.message}`)
    if (perfiles.error) throw new Error(`profiles: ${perfiles.error.message}`)
    if (faltaLaTabla(ya.error)) throw new Error('Falta correr supabase-generos-y-aviso-wrapped-2026-11.sql.')
    if (ya.error) throw new Error(`push_wrapped_enviados: ${ya.error.message}`)
    for (const r of (aparatos.data ?? []) as { user_id: string; push_token: string | null }[]) {
      if (!r.push_token) continue
      const lista = tokens.get(r.user_id) ?? []
      if (!lista.includes(r.push_token)) lista.push(r.push_token)
      tokens.set(r.user_id, lista)
    }
    for (const p of (perfiles.data ?? []) as { id: string; notification_preferences: unknown }[]) {
      if (envioApagado(p.notification_preferences, 'wrapped')) apagados.add(p.id)
    }
    for (const r of (ya.data ?? []) as { user_id: string }[]) avisados.add(r.user_id)
  }

  const candidatos: string[] = []
  for (const id of ids) {
    if (avisados.has(id)) resumen.yaAvisados++
    else if (!tokens.has(id)) resumen.sinAparato++
    else if (apagados.has(id)) resumen.apagada++
    else candidatos.push(id)
  }
  if (opciones.simular) {
    resumen.personas = candidatos.length
    resumen.mensajes = candidatos.reduce((n, id) => n + (tokens.get(id)?.length ?? 0), 0)
    return { ...resumen, saltada: 'Simulación: no se mandó nada.' }
  }
  if (candidatos.length === 0) return { ...resumen, saltada: 'No queda nadie por avisar.' }

  const t = TEXTOS.es
  const { data: fila, error: insertError } = await admin
    .from('push_envios')
    .insert({ tipo: 'wrapped', prueba: false, titulo: t.titulo(anio), cuerpo: 'Armando…', url: '/wrapped', destinatarios: 0 })
    .select('id')
    .single()
  if (insertError || !fila) throw new Error(insertError?.message ?? 'No se pudo registrar el envío.')
  resumen.envioId = fila.id

  // Se anota a cada uno antes de mandar: si otra corrida se cruza, la clave
  // usuario + año hace que cada uno quede en una sola, y sólo a ésos se les manda.
  const reservados = new Set<string>()
  for (let i = 0; i < candidatos.length; i += 500) {
    const { data, error: e } = await admin
      .from('push_wrapped_enviados')
      .upsert(
        candidatos.slice(i, i + 500).map(id => ({ user_id: id, anio, envio_id: fila.id, aparatos: tokens.get(id)?.length ?? 0 })),
        { onConflict: 'user_id,anio', ignoreDuplicates: true },
      )
      .select('user_id')
    if (e) {
      // Todavía no salió nada: se deshace para que la corrida de la hora siguiente lo intente.
      await admin.from('push_wrapped_enviados').delete().eq('envio_id', fila.id)
      await admin.from('push_envios').delete().eq('id', fila.id)
      throw new Error(`push_wrapped_enviados: ${e.message}`)
    }
    for (const r of (data ?? []) as { user_id: string }[]) reservados.add(r.user_id)
  }
  if (reservados.size === 0) {
    await admin.from('push_envios').delete().eq('id', fila.id)
    return { ...resumen, envioId: null, saltada: 'Otra corrida ya los avisó.' }
  }

  const idiomas = await idiomasDe(admin, [...reservados])
  const mensajes: ExpoMessage[] = []
  for (const id of reservados) {
    const idioma = idiomas.get(id) ?? 'es'
    for (const token of tokens.get(id) ?? []) {
      mensajes.push({
        token,
        title: TEXTOS[idioma].titulo(anio),
        body: TEXTOS[idioma].cuerpo,
        // `entityId` es el envío: la app lo devuelve en `push_abierta`.
        data: { url: rutaWrapped(idioma, usuarios.get(id)!, anio), type: 'wrapped', entityId: String(fila.id) },
      })
    }
  }

  const resultado = await sendExpoPushMessages(mensajes)
  const borrados = await deleteDeadTokens(admin, resultado.muertos)
  Object.assign(resumen, {
    personas: reservados.size,
    mensajes: mensajes.length,
    enviados: resultado.aceptados.length,
    fallidos: resultado.fallidos,
    tokensBorrados: borrados,
  })

  const { error: updateError } = await admin
    .from('push_envios')
    .update({
      cuerpo: `${t.cuerpo} · ${reservados.size} ${reservados.size === 1 ? 'persona' : 'personas'}`,
      destinatarios: mensajes.length,
      enviados: resultado.aceptados.length,
      fallidos: resultado.fallidos,
      tokens_borrados: borrados,
      tickets: resultado.aceptados.length > 0 ? resultado.aceptados : null,
      recibos_revisados_en: resultado.aceptados.length > 0 ? null : new Date().toISOString(),
    })
    .eq('id', fila.id)
  if (updateError) console.error('[wrapped-aviso] no se pudo guardar el resultado:', updateError.message)

  return resumen
}
