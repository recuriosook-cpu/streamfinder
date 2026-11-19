'use client'

import { usePathname } from 'next/navigation'
import { esRutaEnIngles, type Idioma } from '@/lib/idioma'

/**
 * El idioma de la página según la URL: inglés bajo `/en/`, castellano en todo
 * lo demás. Sirve también en lo que va en el layout (el aviso de la app), que
 * no recibe props de la página. Ver `lib/idioma.ts`.
 */
export function useIdioma(): Idioma {
  return esRutaEnIngles(usePathname()) ? 'en' : 'es'
}
