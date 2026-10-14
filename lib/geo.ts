/**
 * País del pedido, según Vercel. Funciones puras, sin nada de Next.
 *
 * Vercel calcula el país de la IP antes de que el pedido llegue a la función y
 * lo manda en `x-vercel-ip-country` (ISO 3166-1, dos letras). En local y en
 * cualquier lado que no sea Vercel el encabezado no viene, y todo esto
 * devuelve `null`: nunca se inventa un país.
 *
 * Vercel NO manda el ASN a las funciones (los encabezados `x-vercel-ip-*` son
 * país, región, ciudad, coordenadas, zona horaria y código postal). Las reglas
 * por ASN —Oculus Networks, 398781— sólo pueden vivir en el firewall.
 */

/** El país del pedido, o `null` si no vino o no tiene forma de código ISO. */
export function paisDelPedido(headers: Headers): string | null {
  const raw = headers.get('x-vercel-ip-country')?.trim().toUpperCase()
  if (!raw || !/^[A-Z]{2}$/.test(raw)) return null
  // `XX` y `T1` (Tor) no son países: para el perfil y el panel es "no se sabe".
  if (raw === 'XX' || raw === 'T1') return null
  return raw
}

/**
 * Países bloqueados en el firewall de Vercel (regla "Deny China").
 *
 * El firewall ya los frena antes de llegar. Esta lista es la segunda barrera:
 * si la regla se desactiva o se cambia, lo que entre a `/api/track` desde acá
 * se guarda marcado como bot en vez de inflar el panel. Si se agrega una regla
 * por país en el firewall, va también acá.
 */
export const PAISES_BLOQUEADOS: readonly string[] = ['CN']

/** `bot_reason` para un evento de un país bloqueado, o `null` si no lo es. */
export function motivoPaisBloqueado(pais: string | null): string | null {
  return pais && PAISES_BLOQUEADOS.includes(pais) ? `pais-bloqueado:${pais}` : null
}
