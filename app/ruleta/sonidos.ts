/**
 * Sonidos de la ruleta, sintetizados con Web Audio: no hay archivos de audio.
 *
 * El AudioContext se crea con el primer toque de la persona (`activarAudio`):
 * iPhone y Chrome no dejan sonar nada que no haya arrancado un gesto. Después
 * de eso, el sonido del premio puede salir desde un timer.
 *
 * En iPhone, con el interruptor de silencio puesto, Web Audio no suena: es del
 * sistema y la página no lo puede cambiar.
 */

let ctx: AudioContext | null = null
let salida: GainNode | null = null

export function activarAudio(): void {
  if (typeof window === 'undefined') return
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor()
      salida = ctx.createGain()
      salida.gain.value = 0.9
      salida.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* sin audio: la ruleta anda igual */ }
}

function listo(): boolean {
  return !!ctx && !!salida && ctx.state === 'running'
}

/** Un "tic" seco, como la lengüeta de una ruleta pegando en un clavo. */
export function tic(): void {
  if (!listo() || !salida) return
  const t = ctx!.currentTime
  const osc = ctx!.createOscillator()
  const g = ctx!.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(2400, t)
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.025)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035)
  osc.connect(g).connect(salida)
  osc.start(t)
  osc.stop(t + 0.04)
}

/** Un arpegio corto ascendente con un brillo arriba: el premio. */
export function premio(): void {
  if (!listo() || !salida) return
  const t0 = ctx!.currentTime + 0.02
  // Do, Mi, Sol, Do (C5 E5 G5 C6).
  const notas = [523.25, 659.25, 783.99, 1046.5]
  notas.forEach((f, i) => {
    const t = t0 + i * 0.085
    const largo = i === notas.length - 1 ? 0.6 : 0.22
    for (const [tipo, mult, vol] of [['triangle', 1, 0.2], ['sine', 2, 0.06]] as const) {
      const osc = ctx!.createOscillator()
      const g = ctx!.createGain()
      osc.type = tipo
      osc.frequency.setValueAtTime(f * mult, t)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + largo)
      osc.connect(g).connect(salida!)
      osc.start(t)
      osc.stop(t + largo + 0.05)
    }
  })
}
