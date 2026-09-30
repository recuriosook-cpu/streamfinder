# `.well-known`

## `assetlinks.json` — Android App Links

Le dice a Android que `com.glynbox.app` puede abrir los links de glynbox.com.
Sin este archivo, tocar `https://www.glynbox.com/movie/278` en WhatsApp abre el
navegador aunque la app esté instalada.

### Fingerprints

Hay **dos** y las dos tienen que quedar:

| Huella | Qué es |
|---|---|
| `13:5D:81:…` | Certificado de firma de app de Google Play. Con éste llega el APK al teléfono de quien instala desde la tienda. |
| `EE:80:01:…` | La que venía de la configuración de la TWA. Se conserva porque no está confirmado si es la clave de subida —que sigue firmando los APK de test interno y los que se instalan por `adb`— o una firma vieja. |

Sobrar no rompe nada: Android verifica contra cualquiera de la lista. Faltar sí
—los App Links dejan de verificar y Android manda todo al navegador— así que
ante la duda se agrega, no se saca.

Si alguna vez se confirma que `EE:80:…` no corresponde a ninguna firma en uso,
se puede sacar. Antes de eso, no.

### Cómo obtener el SHA256

Depende de con qué se firme el APK que se instala:

**Si se compila con EAS** (lo normal en un proyecto managed como éste), la key
la genera y guarda Expo:

```bash
eas credentials -p android
# elegir el perfil → "Keystore: Manage everything…" → muestra el SHA256
```

**Si Google Play firma la app** (App Signing, que es el default al publicar),
el fingerprint que vale es el de Google, no el de subida:

```
Play Console → tu app → Configuración → Integridad de la aplicación
→ "Certificado de la clave de firma de la app" → SHA-256
```

Ese es el que hay que poner acá: es el certificado con el que el APK llega al
teléfono del usuario.

**Si hay un keystore local:**

```bash
keytool -list -v -keystore signing.keystore -alias <alias>
```

De la salida, la línea `SHA256:` — el hex separado por dos puntos, tal cual, en
mayúsculas.

### Se pueden poner varios

Es un array a propósito. Durante el desarrollo conviene tener el de debug y el
de producción juntos, así los App Links andan también en los builds de prueba:

```json
"sha256_cert_fingerprints": [
  "AA:BB:...:99",   // release / Play App Signing
  "11:22:...:FF"    // debug
]
```

### Verificar que quedó bien

```bash
curl -s https://www.glynbox.com/.well-known/assetlinks.json
```

Tiene que responder `200` con `Content-Type: application/json`. Después, con la
herramienta oficial de Google:

```
https://developers.google.com/digital-asset-links/tools/generator
```

Y en el teléfono, que es la prueba que vale:

```bash
adb shell am start -a android.intent.action.VIEW -d "https://www.glynbox.com/movie/278"
```

Si abre la app en la ficha de Cadena perpetua, está listo. Si abre Chrome,
falta el fingerprint o no coincide con el del APK instalado.

## `apple-app-site-association` — Universal Links de iOS

Le dice a iOS que la app `NC56K84KJA.com.glynbox.app` (Team ID + bundle ID)
puede abrir los links de glynbox.com. Va sin extensión y se sirve como
`application/json` (lo fija `next.config.ts`).

**Sólo funciona con `www`.** Apple baja este archivo desde su CDN y no sigue
redirecciones, y `glynbox.com` responde 307 hacia `www.glynbox.com`. Por eso
`app.json` declara únicamente `applinks:www.glynbox.com`. Un link al dominio
sin www abre Safari, que redirige a www y se queda en la web.

Las rutas de `components` son las mismas que el intent filter de Android y
las que entiende `src/lib/deepLinks.ts` de la app. `/review/*` abre la ficha de lo reseñado. `/generos` sin id no
está porque la app no tiene pantalla para eso: la abriría en el inicio. Si se
agrega una ruta en la app, va también acá y en `app.json`.

### Verificar que quedó bien

```bash
curl -sI https://www.glynbox.com/.well-known/apple-app-site-association
# 200 y Content-Type: application/json
curl -s https://app-site-association.cdn-apple.com/a/v1/www.glynbox.com
# lo que Apple tiene cacheado; puede tardar hasta un día en actualizarse
```
