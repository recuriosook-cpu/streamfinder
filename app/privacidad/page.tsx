import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — Glynbox",
  description: "Conoce cómo Glynbox recopila, usa y protege tus datos personales.",
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-2 text-white">Política de Privacidad</h1>
        <p className="text-[#A0A0B0] mb-12">Última actualización: abril de 2026</p>

        <div className="space-y-12">
          <section>
            <h2 className="text-xl font-semibold text-[#6B3FE7] mb-4">
              1. Qué datos recopilamos
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Cuando usas Glynbox podemos recopilar los siguientes datos personales:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Correo electrónico</span> — para crear y gestionar tu cuenta.
              </li>
              <li>
                <span className="text-white font-medium">Nombre y foto de perfil</span> — proporcionados directamente por ti o a través de tu proveedor de autenticación.
              </li>
              <li>
                <span className="text-white font-medium">Historial de visualización</span> — películas y series que marcas como vistas, en tu lista o favoritas.
              </li>
              <li>
                <span className="text-white font-medium">Reseñas y valoraciones</span> — el contenido que publicas sobre películas y series.
              </li>
              <li>
                <span className="text-white font-medium">Interacciones sociales</span> — seguidores, seguidos y actividad pública dentro de la plataforma.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#6B3FE7] mb-4">
              2. Cómo usamos los datos
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Utilizamos la información recopilada para los siguientes fines:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>Personalizar tus recomendaciones de películas y series según tu historial.</li>
              <li>Mostrar tu actividad social a usuarios que te siguen.</li>
              <li>Mantener tu sesión activa y tus preferencias guardadas.</li>
              <li>Enviarte notificaciones relacionadas con la actividad de tu cuenta (si las activas).</li>
              <li>Mejorar el funcionamiento y la experiencia general de la plataforma.</li>
            </ul>
            <p className="text-[#A0A0B0] mt-4 text-sm">
              No vendemos ni compartimos tus datos personales con terceros con fines publicitarios.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#6B3FE7] mb-4">
              3. Datos de terceros
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox ofrece la opción de iniciar sesión mediante proveedores externos de autenticación:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Google</span> — al autenticarte con Google, recibimos tu nombre, correo electrónico y foto de perfil pública.
              </li>
              <li>
                <span className="text-white font-medium">Facebook</span> — al autenticarte con Facebook, recibimos tu nombre, correo electrónico y foto de perfil pública.
              </li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3">
              Estos datos se rigen también por las políticas de privacidad de Google y Facebook respectivamente. Glynbox solo almacena la información mínima necesaria para identificarte dentro de la plataforma.
            </p>
            <p className="text-zinc-300 leading-relaxed mt-3">
              La información sobre películas y series se obtiene de{" "}
              <span className="text-white font-medium">The Movie Database (TMDB)</span>. Glynbox no recopila datos personales a través de TMDB.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#6B3FE7] mb-4">
              4. Cookies y almacenamiento local
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox utiliza cookies y almacenamiento local del navegador para:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Sesión</span> — mantener tu sesión iniciada de forma segura entre visitas.
              </li>
              <li>
                <span className="text-white font-medium">Preferencias de país</span> — recordar el país que seleccionaste para filtrar plataformas de streaming disponibles en tu región.
              </li>
              <li>
                <span className="text-white font-medium">Preferencias de interfaz</span> — configuraciones personales de visualización.
              </li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3">
              Puedes eliminar las cookies desde la configuración de tu navegador en cualquier momento, aunque esto puede afectar el funcionamiento de algunas funciones de la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#6B3FE7] mb-4">
              5. Derechos del usuario
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Como usuario de Glynbox tienes los siguientes derechos sobre tus datos:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Acceso</span> — puedes consultar en cualquier momento los datos que tenemos sobre ti desde tu perfil.
              </li>
              <li>
                <span className="text-white font-medium">Rectificación</span> — puedes actualizar tu nombre, foto de perfil y otros datos desde la configuración de tu cuenta.
              </li>
              <li>
                <span className="text-white font-medium">Eliminación</span> — puedes solicitar la eliminación completa de tu cuenta y todos los datos asociados contactándonos directamente.
              </li>
              <li>
                <span className="text-white font-medium">Exportación</span> — puedes solicitar una copia de tus datos (historial, reseñas, listas) contactando al equipo de soporte.
              </li>
              <li>
                <span className="text-white font-medium">Oposición</span> — puedes oponerte al uso de tus datos para personalización de recomendaciones o actividad social.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#6B3FE7] mb-4">
              6. Contacto
            </h2>
            <p className="text-zinc-300 leading-relaxed">
              Si tienes preguntas sobre esta política de privacidad, deseas ejercer alguno de tus derechos o necesitas soporte, puedes contactarnos en:
            </p>
            <a
              href="mailto:fd.lage@gmail.com"
              className="inline-block mt-3 text-[#6B3FE7] hover:text-[#8B6CF5] transition-colors font-medium"
            >
              fd.lage@gmail.com
            </a>
          </section>
        </div>
      </div>

      <footer className="border-t border-[#2A2A3A] mt-16">
        <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[#A0A0B0] text-sm">
          <span>© {new Date().getFullYear()} Glynbox. Todos los derechos reservados.</span>
          <div className="flex gap-6">
            <a href="/privacidad" className="hover:text-zinc-300 transition-colors">
              Privacidad
            </a>
            <a href="/terminos" className="hover:text-zinc-300 transition-colors">
              Términos
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
