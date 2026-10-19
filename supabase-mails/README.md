# Plantillas de los mails de Supabase

Los únicos mails que manda Glynbox los manda Supabase: confirmar la cuenta y
recuperar la contraseña. Desde la app 1.0.16 salen en inglés para quien tiene
la app en inglés.

## Cómo elige el idioma

La app guarda el idioma en los datos de la cuenta (`user_metadata.idioma`):
en el registro (para que el mail de confirmación salga bien de entrada) y cada
vez que cambia (`glynbox-mobile/src/i18n/useSincronizarIdioma.ts`). La
plantilla lo lee como `{{ .Data.idioma }}`:

- `"en"` → inglés.
- cualquier otra cosa, o nada (cuentas de antes de la 1.0.16, o de la web) →
  castellano, como siempre.

La condición es `{{ if and .Data.idioma (eq .Data.idioma "en") }}`: el `and`
de adelante evita comparar un valor vacío, que en las plantillas de Go da error.

## Cómo cargarlas

Supabase Dashboard → proyecto de **Glynbox** → **Authentication → Emails →
Templates** (en algunas versiones: Authentication → Email Templates).

1. **Confirm signup**
   - Subject:
     `{{ if and .Data.idioma (eq .Data.idioma "en") }}Confirm your Glynbox account{{ else }}Confirmá tu cuenta de Glynbox{{ end }}`
   - Message body: pegá entero `confirmar-cuenta.html`.
2. **Reset Password**
   - Subject:
     `{{ if and .Data.idioma (eq .Data.idioma "en") }}Reset your Glynbox password{{ else }}Cambiá tu contraseña de Glynbox{{ end }}`
   - Message body: pegá entero `recuperar-contrasena.html`.
3. **Save** en cada una.

Si al probar el asunto llega con las llaves `{{ ... }}` a la vista, es que tu
proyecto no procesa plantillas en el asunto: dejalo bilingüe, por ejemplo
`Confirmá tu cuenta · Confirm your account` y
`Cambiá tu contraseña · Reset your password`.

## Cómo probarlas

1. **Confirmar cuenta:** con la app en inglés (Ajustes → Idioma → English),
   registrate con un mail de prueba. El mail tiene que llegar en inglés. Con la
   app en castellano, en castellano.
2. **Recuperar contraseña:** desde Ajustes → Cambiar contraseña, con una cuenta
   que ya abrió la app en inglés al menos una vez (ahí se guarda el idioma).
3. En el editor de Supabase, la vista previa no tiene datos de cuenta: muestra
   siempre la parte en castellano. Es normal.
