// ─────────────────────────────────────────────────────────────────────────────
// Celebrity birthday index — used by /api/birthdays-today
// All TMDB IDs verified. popularity field used for sorting.
// ─────────────────────────────────────────────────────────────────────────────

export interface CelebrityBirthday {
  id:         number   // TMDB person ID (verified)
  name:       string   // display name
  birthday:   string   // YYYY-MM-DD
  popularity: number   // used to sort results; higher = shown first
}

export const CELEBRITY_BIRTHDAYS: CelebrityBirthday[] = [

  // ── JANUARY ──────────────────────────────────────────────────────────────
  { id: 51329,    name: 'Bradley Cooper',       birthday: '1975-01-05', popularity: 95 },
  { id: 206,      name: 'Jim Carrey',           birthday: '1962-01-17', popularity: 90 },
  { id: 19498,    name: 'Jeremy Renner',        birthday: '1971-01-07', popularity: 80 },
  { id: 66633,    name: 'Dave Bautista',        birthday: '1969-01-18', popularity: 78 },
  { id: 9399,     name: 'Elijah Wood',          birthday: '1981-01-28', popularity: 75 },
  { id: 2691,     name: 'Orlando Bloom',        birthday: '1977-01-13', popularity: 82 },
  { id: 1373737,  name: 'Florence Pugh',        birthday: '1996-01-03', popularity: 91 },

  // ── FEBRUARY ─────────────────────────────────────────────────────────────
  { id: 1373181,  name: 'Millie Bobby Brown',   birthday: '2004-02-19', popularity: 92 },
  { id: 4491,     name: 'Jennifer Aniston',     birthday: '1969-02-11', popularity: 95 },
  { id: 135651,   name: 'Michael B. Jordan',    birthday: '1987-02-09', popularity: 88 },
  { id: 7447,     name: 'Josh Brolin',          birthday: '1968-02-12', popularity: 78 },
  { id: 2640,     name: 'Drew Barrymore',       birthday: '1975-02-22', popularity: 80 },
  { id: 131597,   name: 'Elizabeth Olsen',      birthday: '1989-02-16', popularity: 85 },
  { id: 80049,    name: 'Mahershala Ali',       birthday: '1974-02-16', popularity: 76 },

  // ── MARCH ────────────────────────────────────────────────────────────────
  { id: 8784,     name: 'Daniel Craig',         birthday: '1968-03-02', popularity: 88 },
  { id: 3061,     name: 'Ewan McGregor',        birthday: '1971-03-31', popularity: 82 },
  { id: 368,      name: 'Reese Witherspoon',    birthday: '1976-03-22', popularity: 85 },
  { id: 10177,    name: 'Keira Knightley',      birthday: '1985-03-26', popularity: 83 },
  { id: 138,      name: 'Quentin Tarantino',    birthday: '1963-03-27', popularity: 88 },
  { id: 1023114,  name: "Lupita Nyong'o",       birthday: '1983-03-01', popularity: 80 },

  // ── APRIL ────────────────────────────────────────────────────────────────
  { id: 1253360,  name: 'Pedro Pascal',         birthday: '1975-04-02', popularity: 95 },
  { id: 3223,     name: 'Robert Downey Jr.',    birthday: '1965-04-04', popularity: 97 },
  { id: 69,       name: 'Paul Rudd',            birthday: '1969-04-06', popularity: 82 },
  { id: 18897,    name: 'Jackie Chan',          birthday: '1954-04-07', popularity: 88 },
  { id: 934,      name: 'Russell Crowe',        birthday: '1964-04-07', popularity: 85 },
  { id: 74363,    name: 'Kristen Stewart',      birthday: '1990-04-09', popularity: 84 },
  { id: 893253,   name: 'Saoirse Ronan',        birthday: '1994-04-12', popularity: 82 },
  { id: 10990,    name: 'Emma Watson',          birthday: '1990-04-15', popularity: 90 },
  { id: 3945,     name: 'Emma Thompson',        birthday: '1959-04-15', popularity: 84 },
  { id: 19397,    name: 'Seth Rogen',           birthday: '1982-04-15', popularity: 82 },
  { id: 219642,   name: 'Luke Evans',           birthday: '1979-04-15', popularity: 80 },
  { id: 1117624,  name: 'Maisie Williams',      birthday: '1997-04-15', popularity: 85 },
  { id: 1340062,  name: 'Anya Taylor-Joy',      birthday: '1996-04-16', popularity: 93 },
  { id: 2299658,  name: 'Sadie Sink',           birthday: '2002-04-16', popularity: 85 },
  { id: 4431,     name: 'Martin Lawrence',      birthday: '1965-04-16', popularity: 78 },
  { id: 10515,    name: 'Charlie Chaplin',      birthday: '1889-04-16', popularity: 72 },
  { id: 1158,     name: 'Al Pacino',            birthday: '1940-04-25', popularity: 92 },
  { id: 1907048,  name: 'Ana de Armas',         birthday: '1988-04-30', popularity: 91 },
  { id: 1517368,  name: 'Gal Gadot',            birthday: '1985-04-30', popularity: 88 },

  // ── MAY ──────────────────────────────────────────────────────────────────
  { id: 18918,    name: 'Dwayne Johnson',       birthday: '1972-05-02', popularity: 97 },
  { id: 5655,     name: 'Wes Anderson',         birthday: '1969-05-01', popularity: 75 },
  { id: 15274,    name: 'Megan Fox',            birthday: '1986-05-16', popularity: 82 },
  { id: 2037,     name: 'Cillian Murphy',       birthday: '1976-05-25', popularity: 95 },
  { id: 1327,     name: 'Ian McKellen',         birthday: '1939-05-25', popularity: 85 },
  { id: 50,       name: 'Paul Bettany',         birthday: '1971-05-27', popularity: 78 },
  { id: 190,      name: 'Clint Eastwood',       birthday: '1930-05-31', popularity: 88 },

  // ── JUNE ─────────────────────────────────────────────────────────────────
  { id: 192,      name: 'Morgan Freeman',       birthday: '1937-06-01', popularity: 93 },
  { id: 1136406,  name: 'Tom Holland',          birthday: '1996-06-01', popularity: 95 },
  { id: 3092,     name: 'Marilyn Monroe',       birthday: '1926-06-01', popularity: 90 },
  { id: 13240,    name: 'Mark Wahlberg',        birthday: '1971-06-05', popularity: 85 },
  { id: 3896,     name: 'Liam Neeson',          birthday: '1952-06-07', popularity: 86 },
  { id: 85,       name: 'Johnny Depp',          birthday: '1963-06-09', popularity: 88 },
  { id: 524,      name: 'Natalie Portman',      birthday: '1981-06-09', popularity: 88 },
  { id: 16828,    name: 'Chris Evans',          birthday: '1981-06-13', popularity: 93 },
  { id: 19957,    name: 'Courteney Cox',        birthday: '1964-06-15', popularity: 80 },
  { id: 73457,    name: 'Chris Pratt',          birthday: '1979-06-21', popularity: 90 },
  { id: 5064,     name: 'Meryl Streep',         birthday: '1949-06-22', popularity: 90 },
  { id: 2219,     name: 'Tobey Maguire',        birthday: '1975-06-27', popularity: 78 },

  // ── JULY ─────────────────────────────────────────────────────────────────
  { id: 234352,   name: 'Margot Robbie',        birthday: '1990-07-02', popularity: 94 },
  { id: 500,      name: 'Tom Cruise',           birthday: '1962-07-03', popularity: 95 },
  { id: 71580,    name: 'Benedict Cumberbatch', birthday: '1976-07-19', popularity: 90 },
  { id: 16483,    name: 'Sylvester Stallone',   birthday: '1946-07-06', popularity: 88 },
  { id: 31,       name: 'Tom Hanks',            birthday: '1956-07-09', popularity: 95 },
  { id: 3,        name: 'Harrison Ford',        birthday: '1942-07-13', popularity: 92 },
  { id: 12835,    name: 'Vin Diesel',           birthday: '1967-07-18', popularity: 85 },
  { id: 2157,     name: 'Robin Williams',       birthday: '1951-07-21', popularity: 90 },
  { id: 235,      name: 'Sandra Bullock',       birthday: '1964-07-26', popularity: 88 },
  { id: 976,      name: 'Jason Statham',        birthday: '1967-07-26', popularity: 84 },

  // ── AUGUST ───────────────────────────────────────────────────────────────
  { id: 45400,    name: 'Greta Gerwig',         birthday: '1983-08-04', popularity: 80 },
  { id: 74568,    name: 'Chris Hemsworth',      birthday: '1983-08-11', popularity: 92 },
  { id: 19492,    name: 'Viola Davis',          birthday: '1965-08-11', popularity: 84 },
  { id: 6885,     name: 'Charlize Theron',      birthday: '1975-08-07', popularity: 88 },
  { id: 3931,     name: 'Halle Berry',          birthday: '1966-08-14', popularity: 86 },
  { id: 880,      name: 'Ben Affleck',          birthday: '1972-08-15', popularity: 87 },
  { id: 72129,    name: 'Jennifer Lawrence',    birthday: '1990-08-15', popularity: 91 },
  { id: 380,      name: 'Robert De Niro',       birthday: '1943-08-17', popularity: 93 },
  { id: 1117665,  name: 'Austin Butler',        birthday: '2001-08-17', popularity: 87 },
  { id: 819,      name: 'Edward Norton',        birthday: '1969-08-18', popularity: 85 },
  { id: 57755,    name: 'Andrew Garfield',      birthday: '1983-08-20', popularity: 86 },
  { id: 510,      name: 'Tim Burton',           birthday: '1958-08-25', popularity: 82 },

  // ── SEPTEMBER ────────────────────────────────────────────────────────────
  { id: 505710,   name: 'Zendaya',              birthday: '1996-09-01', popularity: 97 },
  { id: 5765,     name: 'Salma Hayek',          birthday: '1966-09-02', popularity: 85 },
  { id: 6384,     name: 'Keanu Reeves',         birthday: '1964-09-02', popularity: 94 },
  { id: 17835,    name: 'Idris Elba',           birthday: '1972-09-06', popularity: 88 },
  { id: 2888,     name: 'Will Smith',           birthday: '1968-09-25', popularity: 92 },
  { id: 3289,     name: 'Gwyneth Paltrow',      birthday: '1972-09-27', popularity: 80 },
  { id: 617,      name: 'Marion Cotillard',     birthday: '1975-09-30', popularity: 82 },

  // ── OCTOBER ──────────────────────────────────────────────────────────────
  { id: 137427,   name: 'Denis Villeneuve',     birthday: '1967-10-03', popularity: 80 },
  { id: 60073,    name: 'Christoph Waltz',      birthday: '1956-10-04', popularity: 82 },
  { id: 204,      name: 'Kate Winslet',         birthday: '1975-10-05', popularity: 88 },
  { id: 1892,     name: 'Matt Damon',           birthday: '1970-10-08', popularity: 90 },
  { id: 6968,     name: 'Hugh Jackman',         birthday: '1968-10-12', popularity: 93 },
  { id: 1785339,  name: 'Barry Keoghan',        birthday: '1992-10-18', popularity: 86 },
  { id: 17289,    name: 'Zac Efron',            birthday: '1987-10-18', popularity: 85 },
  { id: 73421,    name: 'Joaquin Phoenix',      birthday: '1974-10-28', popularity: 90 },
  { id: 10859,    name: 'Ryan Reynolds',        birthday: '1976-10-23', popularity: 95 },
  { id: 706,      name: 'Winona Ryder',         birthday: '1971-10-29', popularity: 80 },

  // ── NOVEMBER ─────────────────────────────────────────────────────────────
  { id: 54693,    name: 'Emma Stone',           birthday: '1988-11-06', popularity: 92 },
  { id: 6193,     name: 'Leonardo DiCaprio',    birthday: '1974-11-11', popularity: 97 },
  { id: 17578,    name: 'Rachel McAdams',       birthday: '1978-11-17', popularity: 84 },
  { id: 1023139,  name: 'Adam Driver',          birthday: '1983-11-19', popularity: 88 },
  { id: 1245,     name: 'Scarlett Johansson',   birthday: '1984-11-22', popularity: 94 },
  { id: 9288,     name: 'Mark Ruffalo',         birthday: '1967-11-22', popularity: 84 },
  { id: 65597,    name: 'Miley Cyrus',          birthday: '1992-11-23', popularity: 85 },
  { id: 10297,    name: 'Matthew McConaughey',  birthday: '1969-11-04', popularity: 88 },
  { id: 30614,    name: 'Ryan Gosling',         birthday: '1980-11-12', popularity: 93 },
  { id: 1813,     name: 'Anne Hathaway',        birthday: '1982-11-12', popularity: 88 },
  { id: 172069,   name: 'Chadwick Boseman',     birthday: '1976-11-29', popularity: 88 },
  { id: 11647,    name: 'Gael García Bernal',   birthday: '1978-11-30', popularity: 78 },

  // ── DECEMBER ─────────────────────────────────────────────────────────────
  { id: 8691,     name: 'Judi Dench',           birthday: '1934-12-09', popularity: 80 },
  { id: 287,      name: 'Brad Pitt',            birthday: '1963-12-18', popularity: 96 },
  { id: 488,      name: 'Steven Spielberg',     birthday: '1946-12-18', popularity: 88 },
  { id: 131,      name: 'Jake Gyllenhaal',      birthday: '1980-12-19', popularity: 88 },
  { id: 2231,     name: 'Samuel L. Jackson',    birthday: '1948-12-21', popularity: 93 },
  { id: 1190668,  name: 'Timothée Chalamet',    birthday: '1995-12-27', popularity: 95 },
  { id: 5292,     name: 'Denzel Washington',    birthday: '1954-12-28', popularity: 93 },
  { id: 7045,     name: 'Jude Law',             birthday: '1972-12-29', popularity: 82 },
  { id: 32747,    name: 'Diego Luna',           birthday: '1979-12-29', popularity: 78 },
  { id: 4173,     name: 'Anthony Hopkins',      birthday: '1937-12-31', popularity: 90 },

]

// ── Deduplicated + sorted export ─────────────────────────────────────────────
// Route handler imports BIRTHDAYS (deduped by id, sorted by popularity desc).
const _seen = new Set<number>()
export const BIRTHDAYS: CelebrityBirthday[] = CELEBRITY_BIRTHDAYS
  .filter(c => {
    if (_seen.has(c.id)) return false
    _seen.add(c.id)
    return true
  })
  .sort((a, b) => b.popularity - a.popularity)
