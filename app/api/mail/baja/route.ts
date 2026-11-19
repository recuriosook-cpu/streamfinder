import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import { darDeBaja, tokenValido } from '@/lib/mail-baja'

/**
 * POST /api/mail/baja?t=<token> — da de baja de los mails (ver lib/mail-baja.ts).
 *
 * Dos formas de llegar:
 *   · El botón de /mail/baja (formulario con `t` y `l`): vuelve a la página
 *     con el "listo".
 *   · La baja de un clic de Gmail, Apple Mail y otros (List-Unsubscribe-Post,
 *     RFC 8058): un POST con `List-Unsubscribe=One-Click` y el token en la
 *     URL. Contesta 200 sin página.
 *
 * Sólo POST: los programas que revisan links de los mails hacen GET, y un GET
 * no puede dar de baja a nadie.
 */

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let token: unknown = req.nextUrl.searchParams.get('t')
  let idioma = req.nextUrl.searchParams.get('l') === 'en' ? 'en' : 'es'
  let desdeLaPagina = false

  const tipo = req.headers.get('content-type') ?? ''
  if (tipo.includes('application/x-www-form-urlencoded') || tipo.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (form?.get('desde') === 'pagina') {
      desdeLaPagina = true
      token = form.get('t') ?? token
      idioma = form.get('l') === 'en' ? 'en' : idioma
    }
  }

  const volver = (estado: 'listo' | 'invalido' | 'error') =>
    NextResponse.redirect(
      new URL(`/mail/baja?${new URLSearchParams({ estado, ...(idioma === 'en' ? { l: 'en' } : {}) })}`, req.nextUrl.origin),
      303,
    )

  if (!tokenValido(token)) {
    return desdeLaPagina ? volver('invalido') : NextResponse.json({ ok: false }, { status: 400 })
  }

  const { admin, failure } = requireAdminClient('mail/baja')
  if (failure) return desdeLaPagina ? volver('error') : failure

  try {
    const ok = await darDeBaja(admin, token)
    if (desdeLaPagina) return volver(ok ? 'listo' : 'invalido')
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 })
  } catch (e) {
    console.error('[mail/baja]', (e as Error).message)
    return desdeLaPagina ? volver('error') : NextResponse.json({ ok: false }, { status: 500 })
  }
}
