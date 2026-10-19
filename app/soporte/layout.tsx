import type { Metadata } from 'next'

/**
 * Los metadatos de `/soporte`. Van acá y no en la página porque la página es
 * un componente de cliente (las preguntas se abren y se cierran), y esos no
 * pueden exportar `metadata`: sin esto la pestaña mostraba el título genérico
 * del sitio.
 */
export const metadata: Metadata = {
  title: 'Centro de ayuda — Glynbox',
  description: 'Respuestas a las preguntas frecuentes sobre Glynbox y cómo contactar al soporte.',
  alternates: {
    canonical: '/soporte',
    languages: { es: '/soporte', en: '/en/support' },
  },
}

export default function SoporteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
