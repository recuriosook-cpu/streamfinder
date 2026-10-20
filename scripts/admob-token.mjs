/**
 * Consigue el refresh token de AdMob que usa `/api/cron/admob-stats`.
 *
 * Se corre UNA vez, en la compu, con el navegador a mano:
 *
 *   ADMOB_CLIENT_ID=... ADMOB_CLIENT_SECRET=... node scripts/admob-token.mjs
 *
 * (en PowerShell: `$env:ADMOB_CLIENT_ID="..."; $env:ADMOB_CLIENT_SECRET="..."; node scripts/admob-token.mjs`)
 *
 * Abre un servidor en `127.0.0.1` con un puerto libre, imprime el enlace de
 * permiso de Google y espera la vuelta. Hay que entrar con la cuenta de Google
 * que tiene acceso a la cuenta de AdMob. Si Google avisa que la app no está
 * verificada: "Configuración avanzada" → "Ir a ... (no seguro)". Es nuestra
 * propia app; la verificación sólo hace falta para terceros.
 *
 * Al final imprime el refresh token, que va a `ADMOB_REFRESH_TOKEN` en Vercel.
 * No se guarda en ningún archivo: es una credencial de lectura de toda la
 * cuenta de AdMob y este repo es público.
 *
 * El cliente OAuth tiene que ser de tipo "App de escritorio": esos aceptan
 * cualquier puerto de `127.0.0.1` como vuelta sin registrarlo.
 *
 * Por qué hace falta esto y no una cuenta de servicio: `lib/admob-reports.ts`.
 */

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

const SCOPE = 'https://www.googleapis.com/auth/admob.readonly'

const clientId = process.env.ADMOB_CLIENT_ID?.trim()
const clientSecret = process.env.ADMOB_CLIENT_SECRET?.trim()
if (!clientId || !clientSecret) {
  console.error('Faltan ADMOB_CLIENT_ID y ADMOB_CLIENT_SECRET en el entorno.')
  process.exit(1)
}

// Para que una respuesta que no viene de este pedido no se acepte.
const estado = randomBytes(16).toString('hex')

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname !== '/') {
    res.writeHead(404).end()
    return
  }

  const terminar = (texto, codigo = 0) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(texto)
    servidor.close()
    process.exitCode = codigo
  }

  if (url.searchParams.get('state') !== estado) return terminar('El estado no coincide. Volvé a correr el script.', 1)
  const error = url.searchParams.get('error')
  if (error) {
    console.error('Google devolvió un error:', error)
    return terminar(`Google devolvió un error: ${error}`, 1)
  }

  const code = url.searchParams.get('code')
  const { port } = servidor.address()
  const respuesta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `http://127.0.0.1:${port}`,
      grant_type: 'authorization_code',
    }),
  })
  const json = await respuesta.json()

  if (!json.refresh_token) {
    console.error('Google no devolvió un refresh token:', json)
    return terminar('No llegó el refresh token. Mirá la terminal.', 1)
  }

  console.log('\nListo. Copiá esto a ADMOB_REFRESH_TOKEN en Vercel (Production y Preview):\n')
  console.log(json.refresh_token)
  console.log('')
  terminar('Listo. El refresh token está en la terminal; ya podés cerrar esta pestaña.')
})

servidor.listen(0, '127.0.0.1', () => {
  const { port } = servidor.address()
  const enlace = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  enlace.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `http://127.0.0.1:${port}`,
    response_type: 'code',
    scope: SCOPE,
    // `offline` + `consent`: sin los dos, Google no manda refresh token si la
    // cuenta ya había dado permiso antes.
    access_type: 'offline',
    prompt: 'consent',
    state: estado,
  }).toString()

  console.log('Abrí este enlace y entrá con la cuenta de Google que tiene acceso a AdMob:\n')
  console.log(enlace.toString())
  console.log('\nEsperando la vuelta de Google...')
})
