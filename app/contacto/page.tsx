import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * Contacto. Antes el pie llevaba a un `mailto:` suelto; los revisores (AdSense,
 * las tiendas) buscan una página de contacto propia. Los mails son los mismos
 * que usan `/sobre` (hola@) y `/soporte` (soporte@).
 */

export const metadata: Metadata = {
  title: 'Contacto — Glynbox',
  description:
    'Cómo comunicarte con Glynbox: consultas generales, prensa y colaboraciones, soporte de la app y la web, privacidad y publicidad.',
  alternates: { canonical: 'https://www.glynbox.com/contacto' },
}

const CANALES = [
  {
    titulo: 'Consultas generales, prensa y colaboraciones',
    mail: 'hola@glynbox.com',
    texto: 'Para propuestas, entrevistas, alianzas con creadores o cualquier consulta sobre el proyecto.',
  },
  {
    titulo: 'Soporte de la app y la web',
    mail: 'soporte@glynbox.com',
    texto: 'Errores, problemas para entrar a tu cuenta, pedidos de eliminación de cuenta o de tus datos.',
  },
]

const ENLACE = 'text-[#FFFD02] hover:text-[#FFF84D] transition-colors'

export default function ContactoPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-2 text-white">Contacto</h1>
        <p className="text-[#A0A0B0] mb-12">Respondemos en general dentro de las 48 horas hábiles.</p>

        <div className="space-y-10">
          {CANALES.map(c => (
            <section key={c.mail}>
              <h2 className="text-xl font-semibold text-[#FFFD02] mb-3">{c.titulo}</h2>
              <p className="text-zinc-300 leading-relaxed mb-2">{c.texto}</p>
              <a href={`mailto:${c.mail}`} className={`${ENLACE} font-medium`}>{c.mail}</a>
            </section>
          ))}

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-3">Publicidad y marcas</h2>
            <p className="text-zinc-300 leading-relaxed">
              Si querés anunciar en Glynbox, en{' '}
              <Link href="/anunciantes" className={ENLACE}>Anunciantes</Link> están los formatos y cómo escribirnos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-3">Privacidad</h2>
            <p className="text-zinc-300 leading-relaxed">
              Qué datos guardamos y cómo ejercer tus derechos está en la{' '}
              <Link href="/privacidad" className={ENLACE}>Política de privacidad</Link>. Las reglas de uso del
              sitio y la app, en los <Link href="/terminos" className={ENLACE}>Términos y condiciones</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-3">Redes</h2>
            <ul className="space-y-2 text-zinc-300">
              <li>Instagram: <a href="https://www.instagram.com/glynbox.app" target="_blank" rel="noopener noreferrer" className={ENLACE}>@glynbox.app</a></li>
              <li>X: <a href="https://x.com/glynboxapp" target="_blank" rel="noopener noreferrer" className={ENLACE}>@glynboxapp</a></li>
              <li>TikTok: <a href="https://www.tiktok.com/@glynboxapp" target="_blank" rel="noopener noreferrer" className={ENLACE}>@glynboxapp</a></li>
            </ul>
          </section>

          <p className="text-sm text-zinc-500">
            Glynbox es un proyecto de Fer Lage (<a href="https://www.instagram.com/ferlageok" target="_blank" rel="noopener noreferrer" className={ENLACE}>@ferlageok</a>).
            Más sobre el proyecto en <Link href="/sobre" className={ENLACE}>Sobre Glynbox</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
