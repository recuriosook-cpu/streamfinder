import FichaNoExiste from '@/components/FichaNoExiste'

/** Una ficha en inglés que TMDB no tiene. */
export default function NotFound() {
  return <FichaNoExiste tipo="movie" idioma="en" />
}
