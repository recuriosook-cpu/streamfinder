import type { Metadata } from 'next'
import { itunesPara } from '@/lib/tiendas'

/**
 * La página de la lista es un componente de cliente y no puede exportar
 * metadata; sin esto heredaría la de `/listas`: el aviso de Safari abriría el
 * índice en la app y la canonical le diría a Google que la lista es `/listas`.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const ruta = `/listas/${encodeURIComponent(id)}`
  return {
    alternates: { canonical: `https://www.glynbox.com${ruta}` },
    itunes: itunesPara(ruta),
  }
}

export default function ListaLayout({ children }: { children: React.ReactNode }) {
  return children
}
