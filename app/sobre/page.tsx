import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Sobre Glynbox — La comunidad de cine y series en español',
  description: 'Conocé Glynbox, la comunidad de cine y series más activa de habla hispana. Descubrí quiénes somos, para qué sirve y cómo se financia.',
  alternates: { canonical: 'https://glynbox.com/sobre' },
}

export default function SobrePage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">

        <h1 className="text-4xl font-bold mb-2 text-white">Sobre Glynbox</h1>
        <p className="text-[#A0A0B0] mb-12">El proyecto, el equipo y la comunidad</p>

        <div className="space-y-12">

          {/* 1. Qué es */}
          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">¿Qué es Glynbox?</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">
              Glynbox es una plataforma para amantes del cine y las series de habla hispana. Un lugar donde podés
              registrar todo lo que mirás, descubrir qué ver después, leer y escribir reseñas, y seguir a otros
              cinéfilos con gustos similares.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-4">
              La inspiración viene de <span className="text-white font-medium">Letterboxd</span>, la plataforma de
              referencia mundial para cinéfilos, pero con foco en lo que les falta a los hispanohablantes: interfaz
              en español, disponibilidad de streaming por país (Netflix AR, Disney+ MX, etc.), guías editoriales
              curadas en español y una comunidad que habla tu idioma.
            </p>
            <p className="text-zinc-300 leading-relaxed">
              Los datos de películas y series provienen de{' '}
              <span className="text-white font-medium">The Movie Database (TMDB)</span>, enriquecidos con guías
              editoriales propias, reseñas de usuarios y recomendaciones personalizadas.
            </p>
          </section>

          {/* 2. Para qué sirve */}
          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">¿Para qué sirve?</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">
              Glynbox tiene herramientas para cada momento de tu experiencia como espectador:
            </p>
            <ul className="space-y-3 text-zinc-300">
              {[
                { title: 'Llevar un registro', desc: 'Marcá lo que viste, ponele una nota de 1 a 5 estrellas y escribí una reseña. Tu historial, siempre disponible.' },
                { title: 'Crear listas', desc: 'Armá tu Top 10, tu lista de pendientes, las que querés ver con amigos. Podés hacer listas públicas o privadas.' },
                { title: 'Seguir a otros cinéfilos', desc: 'Seguí a usuarios con gustos similares y descubrí lo que están mirando. La comunidad es el mejor algoritmo de recomendación.' },
                { title: 'Saber dónde está disponible', desc: 'Cada película y serie muestra en qué plataformas de streaming está disponible en tu país: Argentina, México, España y más.' },
                { title: 'Recibir recomendaciones', desc: 'El recomendador por estado de ánimo te sugiere qué ver hoy según cómo te sentís: algo que te haga reír, llorar, pensar o asustar.' },
                { title: 'Leer guías curadas', desc: 'Guías editoriales sobre Studio Ghibli, cine coreano, el MCU, HBO, viajes en el tiempo y mucho más. Contenido editado por humanos, no por algoritmos.' },
              ].map(item => (
                <li key={item.title} className="flex gap-3">
                  <span className="text-[#FFFD02] mt-0.5 shrink-0">→</span>
                  <span>
                    <span className="text-white font-medium">{item.title}</span> — {item.desc}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* 3. Quién está detrás */}
          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">¿Quién está detrás?</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">
              Glynbox es un proyecto creado por{' '}
              <span className="text-white font-medium">Fer (@ferlageok)</span>, creador de contenido sobre cine y
              series con presencia en TikTok, Instagram y YouTube, enfocado en recomendaciones y análisis para la
              audiencia hispanohablante.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-4">
              El proyecto nació de una necesidad personal: querer algo parecido a Letterboxd pero en español, con
              las plataformas de streaming correctas para la región y con una comunidad que comparta el mismo idioma
              y referentes culturales.
            </p>
            <p className="text-zinc-300 leading-relaxed">
              Para consultas generales, colaboraciones o prensa, podés escribirnos a{' '}
              <a href="mailto:hola@glynbox.com" className="text-[#FFFD02] hover:text-[#FFF84D] transition-colors">
                hola@glynbox.com
              </a>.
            </p>
          </section>

          {/* 4. Cómo se financia */}
          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">¿Cómo se financia?</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">
              Glynbox es <span className="text-white font-medium">completamente gratuito</span> para los usuarios.
              No hay planes de pago, suscripciones ni funciones premium.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-4">
              El proyecto se financia mediante dos fuentes:
            </p>
            <ul className="space-y-3 text-zinc-300 mb-4">
              <li className="flex gap-3">
                <span className="text-[#FFFD02] mt-0.5 shrink-0">→</span>
                <span>
                  <span className="text-white font-medium">Publicidad</span> — mostramos anuncios a través de
                  Google AdSense. Podés ver más detalles sobre cómo funciona en nuestra{' '}
                  <Link href="/privacidad" className="text-[#FFFD02] hover:underline">política de privacidad</Link>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-[#FFFD02] mt-0.5 shrink-0">→</span>
                <span>
                  <span className="text-white font-medium">Patrocinios puntuales</span> — eventuales colaboraciones
                  con marcas afines al mundo del cine y el entretenimiento, siempre identificados claramente como
                  contenido patrocinado.
                </span>
              </li>
            </ul>
            <p className="text-zinc-300 leading-relaxed">
              No vendemos tu información personal (nombre, email, historial) a terceros bajo ninguna circunstancia.
            </p>
          </section>

          {/* 5. Datos y privacidad */}
          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">Datos y privacidad</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">
              Respetamos tu privacidad. Podés exportar todos tus datos o eliminar tu cuenta en cualquier momento
              desde <Link href="/ajustes" className="text-[#FFFD02] hover:underline">Ajustes</Link>.
            </p>
            <p className="text-zinc-300 leading-relaxed">
              Para el detalle completo de qué datos recopilamos y cómo los usamos, leé nuestra{' '}
              <Link href="/privacidad" className="text-[#FFFD02] hover:underline">Política de Privacidad</Link>.
            </p>
          </section>

          {/* 6. Comunidad */}
          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">La comunidad</h2>
            <p className="text-zinc-300 leading-relaxed mb-4">
              Glynbox no es solo una app de registro: es una comunidad. Y como toda comunidad, tiene lineamientos básicos:
            </p>
            <ul className="space-y-3 text-zinc-300 mb-4">
              {[
                'Respeto hacia otros usuarios, sin importar gustos ni opiniones.',
                'Sin spoilers sin advertencia previa. Usá la etiqueta de spoiler cuando corresponda.',
                'Sin spam, publicidad ni contenido repetitivo masivo.',
                'Reseñas honestas: está bien no haberla visto completa, está mal calificar lo que no viste.',
              ].map(item => (
                <li key={item} className="flex gap-3">
                  <span className="text-[#FFFD02] mt-0.5 shrink-0">→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-zinc-300 leading-relaxed">
              Si encontrás contenido que incumple estas normas, podés reportarlo usando el menú{' '}
              <span className="text-white font-medium">"..."</span> de cualquier reseña o comentario.
              Revisamos todos los reportes.
            </p>
          </section>

          {/* 7. Contacto */}
          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">Contacto</h2>
            <ul className="space-y-3 text-zinc-300">
              {[
                { label: 'Consultas generales y prensa', value: 'hola@glynbox.com', href: 'mailto:hola@glynbox.com' },
                { label: 'Soporte técnico', value: 'Centro de ayuda', href: '/soporte' },
                { label: 'Privacidad y datos', value: 'Política de privacidad', href: '/privacidad' },
                { label: 'Términos de uso', value: 'Términos y condiciones', href: '/terminos' },
              ].map(item => (
                <li key={item.label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="text-white font-medium min-w-[220px]">{item.label}:</span>
                  <a
                    href={item.href}
                    className="text-[#FFFD02] hover:text-[#FFF84D] transition-colors"
                  >
                    {item.value}
                  </a>
                </li>
              ))}
            </ul>
          </section>

        </div>
      </div>

      <footer className="border-t border-[#2A2A3A] mt-16">
        <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[#A0A0B0] text-sm">
          <span>© {new Date().getFullYear()} Glynbox. Todos los derechos reservados.</span>
          <div className="flex gap-6">
            <Link href="/privacidad" className="hover:text-zinc-300 transition-colors">Privacidad</Link>
            <Link href="/terminos" className="hover:text-zinc-300 transition-colors">Términos</Link>
            <Link href="/soporte" className="hover:text-zinc-300 transition-colors">Soporte</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
