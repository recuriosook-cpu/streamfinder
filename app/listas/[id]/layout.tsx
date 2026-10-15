import type { Metadata } from 'next'
import { itunesPara } from '@/lib/tiendas'

/**
 * Sólo existe para el aviso de Safari: la página de la lista es un componente
 * de cliente y no puede exportar metadata, y sin esto heredaría el de
 * `/listas`, que en la app abre el índice en vez de esta lista.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  return { itunes: itunesPara(`/listas/${encodeURIComponent(id)}`) }
}

export default function ListaLayout({ children }: { children: React.ReactNode }) {
  return children
}
