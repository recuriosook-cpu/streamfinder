import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — Glynbox",
  description: "Conocé cómo Glynbox recopila, usa y protege tus datos personales.",
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-2 text-white">Política de Privacidad</h1>
        <p className="text-[#A0A0B0] mb-12">Última actualización: septiembre de 2026</p>

        <div className="space-y-12">
          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">
              1. Qué datos recopilamos
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Cuando usás Glynbox podemos recopilar los siguientes datos personales:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Correo electrónico</span> — para crear y gestionar tu cuenta.
              </li>
              <li>
                <span className="text-white font-medium">Nombre y foto de perfil</span> — proporcionados directamente por vos o a través de tu proveedor de autenticación.
              </li>
              <li>
                <span className="text-white font-medium">Historial de visualización</span> — películas y series que marcás como vistas, en tu lista o favoritas.
              </li>
              <li>
                <span className="text-white font-medium">Reseñas y valoraciones</span> — el contenido que publicás sobre películas y series.
              </li>
              <li>
                <span className="text-white font-medium">Interacciones sociales</span> — seguidores, seguidos y actividad pública dentro de la plataforma.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">
              2. Cómo usamos los datos
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Utilizamos la información recopilada para los siguientes fines:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>Personalizar tus recomendaciones de películas y series según tu historial.</li>
              <li>Mostrar tu actividad social a usuarios que te siguen.</li>
              <li>Mantener tu sesión activa y tus preferencias guardadas.</li>
              <li>Enviarte notificaciones relacionadas con la actividad de tu cuenta (si las activás).</li>
              <li>Mejorar el funcionamiento y la experiencia general de la plataforma.</li>
            </ul>
            <p className="text-[#A0A0B0] mt-4 text-sm">
              No vendemos tus datos personales (nombre, correo, historial) a terceros. La publicidad que
              mostramos opera a través de cookies de Google AdSense en el sitio web y de Google AdMob en la
              aplicación móvil, descritas en las secciones 5 y 6.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">
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
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">
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
              Podés eliminar las cookies desde la configuración de tu navegador en cualquier momento, aunque esto puede afectar el funcionamiento de algunas funciones de la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">
              5. Publicidad y cookies de terceros
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox utiliza <span className="text-white font-medium">Google AdSense</span> para mostrar publicidad.
              Google y sus socios pueden usar cookies para servir anuncios basados en tus visitas previas a este
              sitio y a otros sitios web en Internet.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              El uso de cookies de publicidad permite que Google y sus socios muestren anuncios relevantes a
              nuestros usuarios. Podés desactivar la publicidad personalizada en cualquier momento desde la{" "}
              <a
                href="https://www.google.com/settings/ads"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FFFD02] hover:text-[#FFF84D] transition-colors"
              >
                Configuración de anuncios de Google
              </a>.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Para más información sobre cómo Google usa los datos en su red publicitaria:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300 mb-3">
              <li>
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FFFD02] hover:text-[#FFF84D] transition-colors"
                >
                  Política de privacidad de Google
                </a>
              </li>
              <li>
                <a
                  href="https://policies.google.com/technologies/cookies"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FFFD02] hover:text-[#FFF84D] transition-colors"
                >
                  Cómo usa Google las cookies
                </a>
              </li>
            </ul>
            <p className="text-[#A0A0B0] text-sm">
              Glynbox no vende tus datos personales (nombre, correo electrónico, historial de visualización) a
              terceros. Las cookies de AdSense son gestionadas directamente por Google bajo sus propias políticas.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">
              6. Publicidad en la aplicación móvil
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              La aplicación móvil de Glynbox para Android muestra publicidad. El proveedor es{" "}
              <span className="text-white font-medium">Google AdMob</span>, un servicio de Google.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Para mostrar los anuncios, Google puede usar:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">El identificador de publicidad del dispositivo</span> — un código que Android le asigna a tu teléfono y que podés restablecer o eliminar cuando quieras.
              </li>
              <li>
                <span className="text-white font-medium">Datos de uso de la app</span> — por ejemplo, qué anuncios se te mostraron, si interactuaste con ellos y datos técnicos del dispositivo, como el modelo o la versión de Android.
              </li>
              <li>
                <span className="text-white font-medium">Datos aproximados de ubicación</span> — derivados de tu dirección IP, para mostrarte anuncios acordes a tu región.
              </li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3 mb-3">
              Glynbox no le envía a Google tu nombre, tu correo electrónico ni tu historial de visualización con
              fines publicitarios. El tratamiento de los datos que Google recopila a través de AdMob se rige por
              sus propias políticas:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300 mb-3">
              <li>
                <a
                  href="https://policies.google.com/technologies/ads"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FFFD02] hover:text-[#FFF84D] transition-colors"
                >
                  Cómo usa Google los datos con fines publicitarios
                </a>
              </li>
              <li>
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#FFFD02] hover:text-[#FFF84D] transition-colors"
                >
                  Política de privacidad de Google
                </a>
              </li>
            </ul>

            <h3 className="text-base font-semibold text-white mt-8 mb-3">
              Consentimiento en el Espacio Económico Europeo y el Reino Unido
            </h3>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Si estás en el Espacio Económico Europeo, Suiza o el Reino Unido, la primera vez que abrís la app te
              pedimos tu consentimiento para el uso de datos con fines publicitarios. Podés cambiar esa decisión
              cuando quieras desde{" "}
              <span className="text-white font-medium">Ajustes → Legales → Opciones de privacidad de anuncios</span>,
              dentro de la aplicación.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Esa opción aparece únicamente para usuarios del Espacio Económico Europeo, Suiza y el Reino Unido.
              Cambiar tu consentimiento no afecta el resto de las funciones de Glynbox.
            </p>

            <h3 className="text-base font-semibold text-white mt-8 mb-3">
              Cómo desactivar la publicidad personalizada
            </h3>
            <p className="text-zinc-300 leading-relaxed mb-3">
              En cualquier país podés pedirle a Android que no se use tu identificador para personalizar anuncios:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-zinc-300">
              <li>
                Abrí los <span className="text-white font-medium">Ajustes</span> de tu teléfono.
              </li>
              <li>
                Entrá en <span className="text-white font-medium">Google → Todos los servicios → Anuncios</span> (según la versión de Android puede aparecer como <span className="text-white font-medium">Privacidad → Anuncios</span>).
              </li>
              <li>
                Elegí <span className="text-white font-medium">Eliminar el ID de publicidad</span> o <span className="text-white font-medium">Desactivar la personalización de anuncios</span>.
              </li>
            </ol>
            <p className="text-zinc-300 leading-relaxed mt-3">
              Vas a seguir viendo publicidad en la app, pero los anuncios dejan de basarse en tus intereses. Desde
              ese mismo menú también podés restablecer tu identificador para empezar de cero.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">
              7. Derechos del usuario
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Como usuario de Glynbox tenés los siguientes derechos sobre tus datos:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>
                <span className="text-white font-medium">Acceso</span> — podés consultar en cualquier momento los datos que tenemos sobre vos desde tu perfil.
              </li>
              <li>
                <span className="text-white font-medium">Rectificación</span> — podés actualizar tu nombre, foto de perfil y otros datos desde la configuración de tu cuenta.
              </li>
              <li>
                <span className="text-white font-medium">Eliminación</span> — podés solicitar la eliminación completa de tu cuenta y todos los datos asociados contactándonos directamente.
              </li>
              <li>
                <span className="text-white font-medium">Exportación</span> — podés solicitar una copia de tus datos (historial, reseñas, listas) contactando al equipo de soporte.
              </li>
              <li>
                <span className="text-white font-medium">Oposición</span> — podés oponerte al uso de tus datos para personalización de recomendaciones o actividad social.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[#FFFD02] mb-4">
              8. Contacto
            </h2>
            <p className="text-zinc-300 leading-relaxed">
              Si tenés preguntas sobre esta política de privacidad, querés ejercer alguno de tus derechos o necesitás soporte, podés contactarnos en:
            </p>
            <a
              href="mailto:contacto@glynbox.com"
              className="inline-block mt-3 text-[#FFFD02] hover:text-[#FFF84D] transition-colors font-medium"
            >
              contacto@glynbox.com
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
