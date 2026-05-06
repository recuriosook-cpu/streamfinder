import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Eliminar cuenta - Glynbox',
  description: 'Instrucciones para eliminar tu cuenta de Glynbox y todos tus datos personales.',
}

export default function EliminarCuentaPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-10">

        {/* Header */}
        <div>
          <Link href="/" className="text-[#FFFD02] text-sm hover:underline">← Volver a Glynbox</Link>
          <h1 className="text-3xl font-bold text-white mt-4">Eliminar tu cuenta de Glynbox</h1>
          <p className="text-[#A0A0B0] mt-2 text-sm">
            Podés eliminar tu cuenta directamente desde la app en cualquier momento.
          </p>
        </div>

        {/* Cómo eliminar la cuenta */}
        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Cómo eliminar tu cuenta</h2>
          <ol className="space-y-3 text-sm text-zinc-300">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#FFFD02] text-black text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <span>Iniciá sesión en <strong className="text-white">glynbox.com</strong> con tu cuenta.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#FFFD02] text-black text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <span>Andá al menú de <strong className="text-white">Ajustes</strong> haciendo clic en el ícono de engranaje (⚙️) en la barra de navegación.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#FFFD02] text-black text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <span>Bajá hasta la sección <strong className="text-white">Zona de peligro</strong> al final de la página.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#FFFD02] text-black text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
              <span>Hacé clic en <strong className="text-white">Eliminar cuenta</strong>, escribí <code className="font-mono bg-[#1C1C27] px-1.5 py-0.5 rounded text-[#FFFD02]">ELIMINAR</code> para confirmar y luego presioná <strong className="text-white">Eliminar definitivamente</strong>.</span>
            </li>
          </ol>
          <div className="pt-2">
            <Link
              href="/ajustes"
              className="inline-block bg-[#FFFD02] hover:bg-[#E5EB00] text-black font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Ir a Ajustes →
            </Link>
          </div>
        </section>

        {/* Qué datos se eliminan */}
        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">¿Qué datos se eliminan?</h2>
          <p className="text-sm text-[#A0A0B0]">Al eliminar tu cuenta se borran de forma permanente e irreversible:</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-zinc-300">
            {[
              'Tu perfil y nombre de usuario',
              'Todas tus reseñas',
              'Tus comentarios',
              'Tus listas personalizadas',
              'Tu historial de películas vistas',
              'Tu watchlist',
              'Tus favoritos',
              'Tus calificaciones',
              'Tus seguidos y seguidores',
              'Tu foto de avatar',
              'Tus notificaciones',
              'Tus estadísticas compartidas',
            ].map(item => (
              <li key={item} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Qué datos se conservan */}
        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">¿Qué datos se conservan?</h2>
          <p className="text-sm text-zinc-300">
            <strong className="text-white">Ninguno.</strong> Glynbox elimina todos tus datos inmediatamente al confirmar la eliminación de la cuenta. No conservamos ningún dato personal una vez que el proceso es completado.
          </p>
        </section>

        {/* Plazo */}
        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">Plazo de eliminación</h2>
          <p className="text-sm text-zinc-300">
            La eliminación es <strong className="text-white">inmediata</strong>. Una vez confirmada la acción, tus datos se eliminan de nuestros servidores en ese momento. No existe un período de recuperación.
          </p>
        </section>

        {/* No podés iniciar sesión */}
        <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">¿No podés iniciar sesión?</h2>
          <p className="text-sm text-zinc-300">
            Si perdiste acceso a tu cuenta y necesitás eliminarla de todas formas, contactanos a{' '}
            <a href="mailto:hola@glynbox.com" className="text-[#FFFD02] hover:underline">hola@glynbox.com</a>{' '}
            con el email asociado a tu cuenta. Lo procesaremos en un plazo de 48 horas.
          </p>
        </section>

      </div>
    </div>
  )
}
