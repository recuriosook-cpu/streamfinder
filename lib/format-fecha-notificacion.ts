const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Momento de una notificación para la bandeja: `14:30`, `Ayer 14:30`,
 * `12 sep 14:30`, y `12 sep 2025 14:30` si es de otro año.
 *
 * Lleva la hora porque con varias notificaciones del mismo día la fecha sola
 * no las distingue. Los días se cuentan por calendario en la hora local, no
 * por "hace menos de 24 h": algo de las 23:50 visto a las 00:10 es de ayer.
 *
 * Los meses van a mano y no con `toLocaleDateString` para que la web y la app
 * (`glynbox-mobile/src/lib/format.ts`, misma función) muestren lo mismo: cada
 * motor abrevia distinto ("sep", "sept.", "set").
 *
 * Una fecha en el futuro (reloj del dispositivo atrasado) cae en el caso de
 * hoy y muestra solo la hora.
 */
export function formatNotifTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  if (d >= hoy) return hora

  const ayer = new Date(hoy)
  ayer.setDate(ayer.getDate() - 1)
  if (d >= ayer) return `Ayer ${hora}`

  const anio = d.getFullYear() === hoy.getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${d.getDate()} ${MESES[d.getMonth()]}${anio} ${hora}`
}
