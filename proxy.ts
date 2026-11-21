import { NextResponse, type NextRequest } from 'next/server'
import { anioDeRuta, wrappedAbierto } from '@/lib/wrapped'

/**
 * Sólo para el Wrapped (ver `config.matcher`): antes del 1 de diciembre de
 * cada año (`WRAPPED_ABRE` en lib/wrapped.ts), la página y sus imágenes dan
 * 404 de verdad. Desde la página no se puede: el `loading.tsx` raíz hace que
 * Next ya haya mandado el 200 cuando la página llama a `notFound()`. Se
 * reescribe a una ruta que no existe, como las fichas con id inválido en
 * next.config.ts.
 */
export function proxy(req: NextRequest) {
  const partes = req.nextUrl.pathname.split('/')
  // /wrapped/u/2026, /en/wrapped/u/2026, /api/share/wrapped/u/2026
  const i = partes.indexOf('wrapped')
  const anio = anioDeRuta(partes[i + 2] ?? '')
  if (anio != null && wrappedAbierto(anio)) return NextResponse.next()
  return NextResponse.rewrite(new URL('/_wrapped-cerrado', req.url))
}

export const config = {
  matcher: ['/wrapped/:path*', '/en/wrapped/:path*', '/api/share/wrapped/:path*'],
}
