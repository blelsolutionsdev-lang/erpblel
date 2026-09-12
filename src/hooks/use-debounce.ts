import { useEffect, useState } from 'react'

/** Evita disparar uma query a cada tecla digitada na busca. */
export function useDebounce<T>(valor: T, delay = 300) {
  const [debounced, setDebounced] = useState(valor)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(valor), delay)
    return () => clearTimeout(id)
  }, [valor, delay])

  return debounced
}
