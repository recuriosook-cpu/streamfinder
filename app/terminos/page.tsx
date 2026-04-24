import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones — Glynbox",
  description: "Lee los términos y condiciones de uso de Glynbox.",
};

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-2 text-white">Términos y Condiciones</h1>
        <p className="text-zinc-400 mb-12">Última actualización: abril de 2026</p>

        <div className="space-y-12">
          <section>
            <h2 className="text-xl font-semibold text-emerald-400 mb-4">
              1. Descripción del servicio
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox es una plataforma web que permite a los usuarios descubrir películas y series, consultar en qué servicios de streaming están disponibles según su país, llevar un registro de lo que han visto, escribir reseñas y seguir la actividad de otros usuarios.
            </p>
            <p className="text-zinc-300 leading-relaxed">
              La información sobre contenido audiovisual es proporcionada por{" "}
              <span className="text-white font-medium">The Movie Database (TMDB)</span>. Glynbox no es responsable de la precisión o disponibilidad de dicha información, ni garantiza que un título esté disponible en ninguna plataforma de streaming específica.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-emerald-400 mb-4">
              2. Uso aceptable
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Al usar Glynbox aceptas utilizar el servicio de forma responsable y respetuosa. Queda expresamente prohibido:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>Publicar contenido ofensivo, discriminatorio, violento o ilegal.</li>
              <li>Realizar spam, publicidad no autorizada o comunicaciones masivas no solicitadas.</li>
              <li>Suplantar la identidad de otras personas o entidades.</li>
              <li>Intentar acceder sin autorización a cuentas de otros usuarios o a los sistemas de Glynbox.</li>
              <li>Usar herramientas automatizadas (bots, scrapers) para extraer datos de la plataforma.</li>
              <li>Publicar reseñas falsas, manipuladas o coordinadas con fines maliciosos.</li>
            </ul>
            <p className="text-zinc-300 leading-relaxed mt-3">
              Glynbox se reserva el derecho de suspender o eliminar cuentas que incumplan estas normas, sin previo aviso.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-emerald-400 mb-4">
              3. Propiedad intelectual
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              La información sobre películas, series, carteles (posters) y otros metadatos mostrados en Glynbox provienen de{" "}
              <span className="text-white font-medium">The Movie Database (TMDB)</span> y están sujetos a sus propias condiciones de uso y derechos de propiedad intelectual.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              El código fuente, diseño y elementos visuales propios de Glynbox son propiedad de sus creadores y no pueden ser reproducidos ni distribuidos sin autorización expresa.
            </p>
            <p className="text-zinc-300 leading-relaxed">
              Las <span className="text-white font-medium">reseñas y valoraciones</span> que publicas en Glynbox son de tu autoría. Al publicarlas, otorgas a Glynbox una licencia no exclusiva para mostrarlas dentro de la plataforma. Puedes eliminar tus reseñas en cualquier momento desde tu perfil.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-emerald-400 mb-4">
              4. Limitación de responsabilidad
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox se proporciona &quot;tal como está&quot;, sin garantías de ningún tipo, expresas o implícitas. En particular:
            </p>
            <ul className="list-disc list-inside space-y-2 text-zinc-300">
              <li>No garantizamos disponibilidad ininterrumpida del servicio.</li>
              <li>No somos responsables de la exactitud de la información sobre disponibilidad en plataformas de streaming, ya que esta puede cambiar sin previo aviso.</li>
              <li>No nos hacemos responsables de pérdidas de datos causadas por fallos técnicos, aunque tomamos medidas razonables para prevenirlas.</li>
              <li>No somos responsables del contenido publicado por usuarios (reseñas, comentarios), aunque moderamos activamente el contenido que incumple estas normas.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-emerald-400 mb-4">
              5. Modificaciones al servicio
            </h2>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Glynbox se reserva el derecho de modificar, suspender o discontinuar cualquier parte del servicio en cualquier momento, con o sin previo aviso.
            </p>
            <p className="text-zinc-300 leading-relaxed mb-3">
              Estos términos y condiciones pueden actualizarse periódicamente. Cuando se realicen cambios significativos, actualizaremos la fecha de esta página. El uso continuado del servicio tras la publicación de cambios implica la aceptación de los nuevos términos.
            </p>
            <p className="text-zinc-300 leading-relaxed">
              Te recomendamos revisar esta página ocasionalmente para mantenerte informado sobre las condiciones vigentes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-emerald-400 mb-4">
              6. Contacto
            </h2>
            <p className="text-zinc-300 leading-relaxed">
              Si tienes preguntas sobre estos términos y condiciones o sobre el uso de Glynbox, puedes contactarnos en:
            </p>
            <a
              href="mailto:fd.lage@gmail.com"
              className="inline-block mt-3 text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
            >
              fd.lage@gmail.com
            </a>
          </section>
        </div>
      </div>

      <footer className="border-t border-zinc-800 mt-16">
        <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-zinc-500 text-sm">
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
