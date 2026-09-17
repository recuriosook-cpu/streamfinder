'use client'

import { usePathname } from 'next/navigation'

/**
 * Decide si el armazón del sitio —navbar, pie, barra de descarga— se monta.
 *
 * Las rutas de abajo se dibujan solas, de borde a borde, y el navbar del sitio
 * sobra o directamente estorba:
 *
 *   - `/admin` tiene su propia barra lateral.
 *   - `/descargar` es la landing de campañas: una sola pantalla, sin scroll y
 *     con un solo botón. Un menú ahí sólo ofrece maneras de irse. Además, como
 *     `AppDownloadBarGate` también está envuelto en este componente, apagarlo
 *     acá evita que la barra flotante aparezca a los 7 segundos ofreciendo la
 *     app en la única página que ya no habla de otra cosa.
 */
const RUTAS_SIN_ARMAZON = ['/admin', '/descargar']

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (RUTAS_SIN_ARMAZON.some(ruta => pathname?.startsWith(ruta))) return null
  return <>{children}</>
}
