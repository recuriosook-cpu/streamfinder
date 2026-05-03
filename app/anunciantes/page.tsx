'use client'

import { useState } from 'react'

const STATS = [
  { value: '+12.000',  label: 'usuarios activos' },
  { value: '+5.000',   label: 'reseñas publicadas' },
  { value: '+300.000', label: 'títulos disponibles' },
]

const REASONS = [
  {
    icon: '🎯',
    title: 'Audiencia altamente segmentada',
    desc: 'Amantes del cine y las series que consumen contenido de forma activa y toman decisiones de compra informadas.',
  },
  {
    icon: '🌎',
    title: 'Presencia en toda Latinoamérica',
    desc: 'Usuarios en Argentina, México, Colombia, Chile, Uruguay y toda la región hispanohablante.',
  },
  {
    icon: '📋',
    title: 'Formatos flexibles',
    desc: 'Banner, contenido patrocinado, newsletter, menciones en redes sociales y más. Adaptamos el formato a tu marca.',
  },
  {
    icon: '📊',
    title: 'Reportes detallados',
    desc: 'Métricas claras de impresiones, clics y conversiones para que midas el retorno de tu inversión.',
  },
]

const INPUT_CLASS = 'w-full bg-[#1C1C27] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition-colors'
const LABEL_CLASS = 'block text-xs font-medium text-[#A0A0B0] mb-1.5'

export default function AnunciantesPage() {
  const [form, setForm] = useState({ nombre: '', empresa: '', email: '', mensaje: '' })

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = () => {
    const subject = encodeURIComponent(`Consulta de anunciante — ${form.empresa || 'Glynbox'}`)
    const body    = encodeURIComponent(
      `Nombre: ${form.nombre}\nEmpresa: ${form.empresa}\nEmail: ${form.email}\n\nMensaje:\n${form.mensaje}`
    )
    window.open(`mailto:ads@glynbox.com?subject=${subject}&body=${body}`, '_blank')
  }

  const heroSubject = encodeURIComponent('Consulta publicitaria — Glynbox')
  const heroBody    = encodeURIComponent('Hola, me interesa anunciarme en Glynbox.\n\nEmpresa:\nProducto/Servicio:\nPresupuesto estimado:\nMensaje:')

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 pt-20 pb-16 text-center">
        <span className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-6"
          style={{ background: 'rgba(255,253,2,0.12)', color: '#FFFD02' }}>
          Para marcas y empresas
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
          Llegá a miles de cinéfilos<br />en Latinoamérica
        </h1>
        <p className="text-lg text-[#A0A0B0] max-w-2xl mx-auto mb-10">
          Glynbox es la comunidad de cine y series más activa de habla hispana.
          Conectá tu marca con una audiencia apasionada y comprometida.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto mb-10">
          {STATS.map(s => (
            <div key={s.label} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
              <p className="text-2xl sm:text-3xl font-bold text-[#FFFD02]">{s.value}</p>
              <p className="text-xs text-[#A0A0B0] mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <a
          href={`mailto:ads@glynbox.com?subject=${heroSubject}&body=${heroBody}`}
          className="inline-block px-8 py-3.5 rounded-full font-semibold text-black transition-all hover:scale-105"
          style={{ backgroundColor: '#FFFD02' }}
        >
          Contactar al equipo de publicidad
        </a>
      </section>

      {/* Por qué anunciarte */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8">¿Por qué anunciarte en Glynbox?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {REASONS.map(r => (
            <div key={r.title} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-6">
              <span className="text-3xl mb-3 block">{r.icon}</span>
              <h3 className="text-base font-bold text-white mb-2">{r.title}</h3>
              <p className="text-sm text-[#A0A0B0] leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Formulario interactivo */}
      <section className="max-w-2xl mx-auto px-4 pb-20">
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-8">
          <h2 className="text-xl font-bold mb-2">Escribinos</h2>
          <p className="text-sm text-[#A0A0B0] mb-6">
            Completá el formulario o envianos un email directamente a{' '}
            <a href="mailto:ads@glynbox.com" className="text-[#FFFD02] hover:underline">
              ads@glynbox.com
            </a>
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>Nombre</label>
                <input
                  value={form.nombre}
                  onChange={set('nombre')}
                  placeholder="Tu nombre"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Empresa</label>
                <input
                  value={form.empresa}
                  onChange={set('empresa')}
                  placeholder="Tu empresa"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="tu@empresa.com"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Mensaje</label>
              <textarea
                rows={4}
                value={form.mensaje}
                onChange={set('mensaje')}
                placeholder="Contanos sobre tu producto y qué tipo de campaña te interesa..."
                className={`${INPUT_CLASS} resize-none`}
              />
            </div>

            <button
              onClick={handleSubmit}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-black transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: '#FFFD02' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Enviar consulta
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
