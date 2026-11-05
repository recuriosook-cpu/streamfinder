import FichaNoExiste from '@/components/FichaNoExiste'

/** La ficha de una serie que TMDB no tiene, o un id que no es un número. Sale con status 404. */
export default function NotFound() {
  return <FichaNoExiste tipo="tv" />
}
