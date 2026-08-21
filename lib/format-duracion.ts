/**
 * Segundos a algo legible: "2h 15m", "45m", "30s".
 *
 * Nadie lee 8100 segundos y entiende cuánto es. La unidad más chica se corta
 * cuando ya hay horas —"2h 15m" y no "2h 15m 33s"— porque el tercer nivel de
 * precisión no cambia ninguna decisión y hace la columna ilegible.
 *
 * `null` devuelve "sin datos", no "0s". Son cosas distintas: 0s dice "estuvo
 * cero tiempo", "sin datos" dice "no lo medimos". Con la medición recién
 * arrancada, casi todo es lo segundo.
 *
 * Nota: `app/admin/usuarios/page.tsx` tiene su propia copia de esto. No la
 * unifiqué acá porque esa página quedó cerrada y no había motivo para tocarla;
 * cuando haya que editarla por otra cosa, que importe de acá y se borre.
 */
export function fmtDuracion(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) return 'sin datos'
  if (segundos < 60) return `${Math.round(segundos)}s`

  const totalMin = Math.floor(segundos / 60)
  if (totalMin < 60) return `${totalMin}m`

  const horas = Math.floor(totalMin / 60)
  const min = totalMin % 60
  return min > 0 ? `${horas}h ${min}m` : `${horas}h`
}
