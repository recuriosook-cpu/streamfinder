'use client'

import { useEffect, useState } from 'react'
import { PLATAFORMAS_DE_RESPALDO, type PlataformaPais } from '@/lib/plataformas-pais'

/** Lo ya pedido, por país: volver a uno es instantáneo. */
const memoria = new Map<string, PlataformaPais[]>()
const enCurso = new Map<string, Promise<PlataformaPais[]>>()

/** La lista del país, de `/api/plataformas`. Tira si no se pudo traer. */
export function traerPlataformas(pais: string): Promise<PlataformaPais[]> {
  const hay = memoria.get(pais)
  if (hay) return Promise.resolve(hay)
  const pendiente = enCurso.get(pais)
  if (pendiente) return pendiente
  const pedido = fetch(`/api/plataformas?pais=${pais}`)
    .then(async res => {
      if (!res.ok) throw new Error(`${res.status}`)
      const lista = ((await res.json()) as { plataformas?: PlataformaPais[] }).plataformas ?? []
      if (lista.length === 0) throw new Error('sin plataformas')
      memoria.set(pais, lista)
      return lista
    })
    .finally(() => enCurso.delete(pais))
  enCurso.set(pais, pedido)
  return pedido
}

/**
 * Las plataformas del país elegido. Mientras carga, `cargando` y nada de lista:
 * mostrar las de otro país es justo lo que no tiene que pasar. Si falla, las
 * conocidas con `fiable: false`, y con eso nadie concluye que falta una.
 */
export function usePlataformasPais(pais: string): { plataformas: PlataformaPais[]; cargando: boolean; fiable: boolean } {
  const [estado, setEstado] = useState<{ pais: string; lista: PlataformaPais[] | null; fallo: boolean }>(
    () => ({ pais, lista: memoria.get(pais) ?? null, fallo: false }),
  )

  useEffect(() => {
    let vivo = true
    traerPlataformas(pais)
      .then(lista => { if (vivo) setEstado({ pais, lista, fallo: false }) })
      .catch(() => { if (vivo) setEstado({ pais, lista: null, fallo: true }) })
    return () => { vivo = false }
  }, [pais])

  // Recién cambiado el país, `estado` todavía es del anterior.
  if (estado.pais !== pais) {
    const hay = memoria.get(pais)
    return { plataformas: hay ?? [], cargando: !hay, fiable: !!hay }
  }
  if (estado.lista) return { plataformas: estado.lista, cargando: false, fiable: true }
  return estado.fallo
    ? { plataformas: PLATAFORMAS_DE_RESPALDO, cargando: false, fiable: false }
    : { plataformas: [], cargando: true, fiable: false }
}
