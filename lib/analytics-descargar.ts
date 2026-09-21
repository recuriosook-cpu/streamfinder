/**
 * Las ventanas de tiempo del panel de `/descargar`.
 *
 * Viven acá y no en el `route.ts` por una regla de Next 16: un archivo de ruta
 * sólo puede exportar los handlers y un puñado de claves de configuración
 * conocidas. Exportar cualquier otro valor lo rompe con un error de tipos que
 * no dice mucho (`Type 'readonly [7, 30]' is not assignable to type 'never'`).
 * Los `type` y las `interface` sí se pueden exportar de una ruta —se borran al
 * compilar—, por eso las formas de la respuesta siguen viviendo allá.
 *
 * Y viven en un solo lado, no copiadas en el endpoint y en el panel, porque son
 * las dos mitades de un contrato: el panel ofrece los botones y el endpoint
 * decide qué acepta. Si se separan, agregar una ventana nueva es agregar un
 * botón que devuelve siempre lo mismo que el anterior.
 *
 * La lista es cerrada, además, porque el parámetro llega por querystring, o sea
 * de afuera: un `?dias=100000` sería un scan completo de `analytics_events`
 * servido a pedido.
 */

export const VENTANAS = [7, 30] as const

export type Ventana = (typeof VENTANAS)[number]

export const VENTANA_POR_DEFECTO: Ventana = 30

export function esVentana(v: unknown): v is Ventana {
  return (VENTANAS as readonly unknown[]).includes(v)
}
