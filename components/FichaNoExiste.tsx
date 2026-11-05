import Link from 'next/link'

/**
 * Lo que se ve en una ficha de película o serie que no existe. La muestran los
 * `not-found.tsx` de `/movie/[id]` y `/tv/[id]`, así que sale con status 404.
 */
export default function FichaNoExiste({ tipo }: { tipo: 'movie' | 'tv' }) {
  const peli = tipo === 'movie'
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex flex-col items-center justify-center gap-6 px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Glynbox" style={{ height: '48px' }} />
      <div style={{ fontSize: '80px' }}>{peli ? '🎬' : '📺'}</div>
      <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, textAlign: 'center' }}>
        {peli ? 'Esta película no existe' : 'Esta serie no existe'}
      </h1>
      <p style={{ color: '#A0A0B0', textAlign: 'center', maxWidth: '400px' }}>
        No encontramos información sobre este título. Puede que el ID sea incorrecto o que {peli ? 'la película' : 'la serie'} haya sido eliminada de nuestra base de datos.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/" style={{ background: '#FFFD02', color: '#000', padding: '12px 24px', borderRadius: '50px', fontWeight: 600, textDecoration: 'none' }}>
          Volver al inicio
        </Link>
        <Link href="/que-ver" style={{ border: '1px solid #2A2A3A', color: '#fff', padding: '12px 24px', borderRadius: '50px', textDecoration: 'none' }}>
          Explorar títulos
        </Link>
      </div>
    </div>
  )
}
