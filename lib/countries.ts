export interface Country {
  code: string
  name: string
  flag: string
}

function flag(code: string): string {
  return [...code]
    .map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('')
}

// Countries that TMDB supports for watch_region / streaming providers
export const COUNTRIES: Country[] = [
  // Latin America
  { code: 'AR', name: 'Argentina',       flag: flag('AR') },
  { code: 'BO', name: 'Bolivia',         flag: flag('BO') },
  { code: 'BR', name: 'Brasil',          flag: flag('BR') },
  { code: 'CL', name: 'Chile',           flag: flag('CL') },
  { code: 'CO', name: 'Colombia',        flag: flag('CO') },
  { code: 'CR', name: 'Costa Rica',      flag: flag('CR') },
  { code: 'EC', name: 'Ecuador',         flag: flag('EC') },
  { code: 'GT', name: 'Guatemala',       flag: flag('GT') },
  { code: 'HN', name: 'Honduras',        flag: flag('HN') },
  { code: 'MX', name: 'México',          flag: flag('MX') },
  { code: 'PA', name: 'Panamá',          flag: flag('PA') },
  { code: 'PY', name: 'Paraguay',        flag: flag('PY') },
  { code: 'PE', name: 'Perú',            flag: flag('PE') },
  { code: 'DO', name: 'Rep. Dominicana', flag: flag('DO') },
  { code: 'UY', name: 'Uruguay',         flag: flag('UY') },
  { code: 'VE', name: 'Venezuela',       flag: flag('VE') },
  // North America
  { code: 'US', name: 'Estados Unidos',  flag: flag('US') },
  { code: 'CA', name: 'Canadá',          flag: flag('CA') },
  // Europe
  { code: 'GB', name: 'Reino Unido',     flag: flag('GB') },
  { code: 'ES', name: 'España',          flag: flag('ES') },
  { code: 'FR', name: 'Francia',         flag: flag('FR') },
  { code: 'DE', name: 'Alemania',        flag: flag('DE') },
  { code: 'IT', name: 'Italia',          flag: flag('IT') },
  { code: 'PT', name: 'Portugal',        flag: flag('PT') },
  { code: 'NL', name: 'Países Bajos',    flag: flag('NL') },
  { code: 'BE', name: 'Bélgica',         flag: flag('BE') },
  { code: 'CH', name: 'Suiza',           flag: flag('CH') },
  { code: 'AT', name: 'Austria',         flag: flag('AT') },
  { code: 'SE', name: 'Suecia',          flag: flag('SE') },
  { code: 'NO', name: 'Noruega',         flag: flag('NO') },
  { code: 'DK', name: 'Dinamarca',       flag: flag('DK') },
  { code: 'FI', name: 'Finlandia',       flag: flag('FI') },
  { code: 'PL', name: 'Polonia',         flag: flag('PL') },
  { code: 'CZ', name: 'Rep. Checa',      flag: flag('CZ') },
  { code: 'HU', name: 'Hungría',         flag: flag('HU') },
  { code: 'RO', name: 'Rumania',         flag: flag('RO') },
  { code: 'GR', name: 'Grecia',          flag: flag('GR') },
  { code: 'TR', name: 'Turquía',         flag: flag('TR') },
  { code: 'RU', name: 'Rusia',           flag: flag('RU') },
  // Asia-Pacific
  { code: 'AU', name: 'Australia',       flag: flag('AU') },
  { code: 'NZ', name: 'Nueva Zelanda',   flag: flag('NZ') },
  { code: 'JP', name: 'Japón',           flag: flag('JP') },
  { code: 'KR', name: 'Corea del Sur',   flag: flag('KR') },
  { code: 'IN', name: 'India',           flag: flag('IN') },
  // Africa / Middle East
  { code: 'ZA', name: 'Sudáfrica',       flag: flag('ZA') },
  { code: 'SA', name: 'Arabia Saudita',  flag: flag('SA') },
]

export const DEFAULT_COUNTRY = 'AR'

export function getCountry(code: string): Country {
  return COUNTRIES.find(c => c.code === code) ?? COUNTRIES[0]
}
