import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * /mail/baja?t=<token>[&l=en] — el link "Darme de baja" de los mails.
 *
 * Pide confirmar con un botón (un POST a /api/mail/baja) en vez de dar de baja
 * al abrir: los antivirus del correo abren los links solos, y con un GET se
 * daría de baja gente que no lo pidió. Al volver trae `estado`.
 */

export const metadata: Metadata = {
  title: 'Mails de Glynbox',
  robots: { index: false, follow: false },
}

const TEXTOS = {
  es: {
    titulo: 'Dejar de recibir mails de Glynbox',
    texto: 'Si confirmás, no te vamos a mandar más mails. Tu cuenta sigue igual.',
    boton: 'Darme de baja',
    listo: 'Listo, no vas a recibir más mails de Glynbox.',
    invalido: 'Este link no es válido o ya venció. Si querés darte de baja, escribinos a hola@glynbox.com.',
    error: 'No pudimos guardar la baja. Probá de nuevo en un rato o escribinos a hola@glynbox.com.',
    volver: 'Ir a Glynbox',
  },
  en: {
    titulo: 'Stop getting Glynbox emails',
    texto: "If you confirm, we won't send you any more emails. Your account stays the same.",
    boton: 'Unsubscribe',
    listo: "Done, you won't get any more emails from Glynbox.",
    invalido: "This link isn't valid. To unsubscribe, email us at hola@glynbox.com.",
    error: "We couldn't save that. Please try again later or email us at hola@glynbox.com.",
    volver: 'Go to Glynbox',
  },
} as const

export default async function MailBajaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const idioma = uno(sp.l) === 'en' ? 'en' : 'es'
  const x = TEXTOS[idioma]
  const token = uno(sp.t) ?? ''
  const estado = uno(sp.estado)

  const mensaje =
    estado === 'listo' ? x.listo : estado === 'invalido' ? x.invalido : estado === 'error' ? x.error : null

  return (
    <div className="min-h-screen bg-[#0A0A0F] py-16 px-4">
      <div className="max-w-md mx-auto bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-8 space-y-5">
        <p className="text-[#FFFD02] text-xl font-bold">Glynbox</p>
        <h1 className="text-xl font-bold text-white">{x.titulo}</h1>
        {mensaje ? (
          <p className="text-sm text-[#A0A0B0]">{mensaje}</p>
        ) : token ? (
          <form method="post" action="/api/mail/baja" className="space-y-5">
            <p className="text-sm text-[#A0A0B0]">{x.texto}</p>
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="l" value={idioma} />
            <input type="hidden" name="desde" value="pagina" />
            <button
              type="submit"
              className="w-full bg-[#FFFD02] text-[#0A0A0F] font-bold rounded-xl py-3 text-sm hover:opacity-90"
            >
              {x.boton}
            </button>
          </form>
        ) : (
          <p className="text-sm text-[#A0A0B0]">{x.invalido}</p>
        )}
        <Link href="/" className="block text-center text-sm text-[#A0A0B0] hover:text-white">{x.volver}</Link>
      </div>
    </div>
  )
}
