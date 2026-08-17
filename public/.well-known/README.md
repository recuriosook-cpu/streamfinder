# `.well-known`

## `assetlinks.json` — Android App Links

Le dice a Android que `com.glynbox.app` puede abrir los links de glynbox.com.
Sin este archivo, tocar `https://www.glynbox.com/movie/278` en WhatsApp abre el
navegador aunque la app esté instalada.

### Fingerprint

El `sha256_cert_fingerprints` que está acá es el del certificado con el que
se firma la app en Play (venía de la configuración de la TWA). Si alguna vez
cambia la firma —o si se agrega un build de debug— hay que actualizarlo o los
App Links dejan de verificar y Android manda todo al navegador.

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

## iOS

`app.json` ya declara `associatedDomains`, pero los Universal Links de iOS
necesitan además un `apple-app-site-association` en esta misma carpeta, con el
Team ID de la cuenta de Apple Developer. Se agrega cuando haya build de iOS.
