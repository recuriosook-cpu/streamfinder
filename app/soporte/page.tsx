'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: '¿Cómo creo una cuenta?',
    a: 'Hacé clic en "Entrar" en la barra de navegación. Podés registrarte con tu email y contraseña, o usar tu cuenta de Google para un acceso más rápido.',
  },
  {
    q: '¿Cómo agrego una película a mi lista?',
    a: 'En la página de cualquier película o serie, hacé clic en el botón "Agregar a lista". Podés crear listas personalizadas o usar las predefinidas como "Para ver" o "Favoritas".',
  },
  {
    q: '¿Cómo escribo una reseña?',
    a: 'Entrá a la página de la película o serie que querés reseñar. Bajá hasta la sección "Reseñas" y hacé clic en "Escribir reseña". Podés darle una calificación de 1 a 5 estrellas y agregar tu opinión.',
  },
  {
    q: '¿Cómo sigo a otros usuarios?',
    a: 'Visitá el perfil de cualquier usuario haciendo clic en su nombre o buscándolo. En su perfil vas a ver el botón "Seguir". También podés encontrar usuarios en la sección Comunidad.',
  },
  {
    q: '¿Cómo reporto un error?',
    a: 'Escribinos a soporte@glynbox.com con una descripción del error, el dispositivo que usás y los pasos para reproducirlo. También podés usar el formulario de esta página.',
  },
  {
    q: '¿Cómo elimino mi cuenta?',
    a: 'Para eliminar tu cuenta, escribinos a soporte@glynbox.com con el asunto "Eliminar cuenta". Procesamos las solicitudes en menos de 48 horas.',
  },
  {
    q: '¿Glynbox es gratuito?',
    a: 'Sí, Glynbox es completamente gratuito. Podés registrarte, crear listas, escribir reseñas y participar en la comunidad sin costo alguno.',
  },
  {
    q: '¿En qué países está disponible Glynbox?',
    a: 'Glynbox está disponible en toda Latinoamérica y España. La disponibilidad del streaming varía según tu país, y nos adaptamos para mostrar las opciones correctas en tu región.',
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#2A2A3A] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left bg-[#13131A] hover:bg-[#1C1C27] transition-colors"
      >
        <span className="text-sm font-semibold text-white">{q}</span>
        <ChevronDown size={16} className={`text-[#A0A0B0] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 py-4 text-sm text-[#A0A0B0] leading-relaxed bg-[#0F0F14] border-t border-[#2A2A3A]">
          {a}
        </div>
      )}
    </div>
  )
}

export default function SoportePage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-20">

        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Centro de ayuda</h1>
          <p className="text-[#A0A0B0]">Encontrá respuestas a las preguntas más frecuentes.</p>
        </div>

        {/* FAQ */}
        <section className="space-y-3 mb-14">
          <h2 className="text-lg font-bold mb-5">Preguntas frecuentes</h2>
          {FAQS.map(faq => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </section>

        {/* CTA soporte */}
        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(255,253,2,0.12)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFD02" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">¿No encontraste lo que buscabas?</h2>
          <p className="text-sm text-[#A0A0B0] mb-6 max-w-sm mx-auto">
            Escribinos a{' '}
            <a href="mailto:soporte@glynbox.com" className="text-[#FFFD02] hover:underline">
              soporte@glynbox.com
            </a>{' '}
            y te respondemos en menos de 48 horas.
          </p>
          <a
            href="mailto:soporte@glynbox.com?subject=Consulta de soporte — Glynbox"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-black transition-all hover:opacity-90"
            style={{ backgroundColor: '#FFFD02' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Enviar email a soporte
          </a>
        </section>

        {/* Redes sociales */}
        <section className="mt-10">
          <p className="text-center text-sm text-[#A0A0B0] mb-5">
            También podés contactarnos por redes sociales:
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {[
              {
                label: 'TikTok',
                handle: '@glynboxapp',
                href: 'https://www.tiktok.com/@glynboxapp',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.52V6.76a4.85 4.85 0 01-1-.07z" />
                  </svg>
                ),
              },
              {
                label: 'Instagram',
                handle: '@glynbox.app',
                href: 'https://www.instagram.com/glynbox.app',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                  </svg>
                ),
              },
              {
                label: 'X (Twitter)',
                handle: '@glynboxapp',
                href: 'https://x.com/glynboxapp',
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
                  </svg>
                ),
              },
            ].map(s => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Glynbox en ${s.label}`}
                className="group flex items-center justify-center gap-2.5 bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/40 rounded-xl px-5 py-3 text-sm text-[#A0A0B0] hover:text-[#FFFD02] transition-all"
              >
                <span className="shrink-0">{s.icon}</span>
                <span className="font-medium">{s.label}</span>
                <span className="text-xs opacity-60">{s.handle}</span>
              </a>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
