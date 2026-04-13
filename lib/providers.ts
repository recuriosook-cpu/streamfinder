// Popular streaming providers in Argentina with their TMDB IDs
export const STREAMING_PROVIDERS: Record<number, { name: string; logo: string }> = {
  8: { name: 'Netflix', logo: 'https://image.tmdb.org/t/p/original/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg' },
  337: { name: 'Disney+', logo: 'https://image.tmdb.org/t/p/original/7rwgEs15tFwyR9NPQ5vpzxTj19d.jpg' },
  119: { name: 'Amazon Prime', logo: 'https://image.tmdb.org/t/p/original/68MNrwlkpF7WnmNPXLah69CR5xh.jpg' },
  384: { name: 'HBO Max', logo: 'https://image.tmdb.org/t/p/original/Ajqyt5aNxNGjmF9uOfxArGrdf3X.jpg' },
  2: { name: 'Apple TV+', logo: 'https://image.tmdb.org/t/p/original/6uhKBfmtzFqOcLousHwZuzcrScK.jpg' },
  283: { name: 'Crunchyroll', logo: 'https://image.tmdb.org/t/p/original/8Gt1iClBlzTeQs8WQm8UrCoIxnQ.jpg' },
  39: { name: 'Claro Video', logo: 'https://image.tmdb.org/t/p/original/cDzkhgBxFKJMvdN94oGNvPBRmXo.jpg' },
  167: { name: 'Paramount+', logo: 'https://image.tmdb.org/t/p/original/h5DcR0J2EESLitnhR8xLG1QymTE.jpg' },
  531: { name: 'Paramount+', logo: 'https://image.tmdb.org/t/p/original/h5DcR0J2EESLitnhR8xLG1QymTE.jpg' },
  619: { name: 'Star+', logo: 'https://image.tmdb.org/t/p/original/6enFbwsOWBaHAe1aHOblEBLBOqg.jpg' },
}

export const PROVIDER_FILTER_OPTIONS = [
  { id: 8, name: 'Netflix' },
  { id: 337, name: 'Disney+' },
  { id: 119, name: 'Amazon Prime' },
  { id: 384, name: 'HBO Max' },
  { id: 2, name: 'Apple TV+' },
  { id: 167, name: 'Paramount+' },
  { id: 619, name: 'Star+' },
]
