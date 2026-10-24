import { useCallback, useEffect, useState } from 'react';

/**
 * Hook de carga de datos: encapsula el ciclo cargando / datos / error y
 * expone `recargar` para refrescar tras una escritura.
 *
 *   const { datos, cargando, error, recargar } = useRecurso(
 *     () => lineas.listar({ estado: 'activa' }),
 *     [estado],
 *   );
 */
export function useRecurso(consulta, dependencias = []) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const ejecutar = useCallback(async (senal) => {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await consulta();
      if (!senal?.aborted) setDatos(respuesta);
    } catch (e) {
      if (!senal?.aborted) setError(e);
    } finally {
      if (!senal?.aborted) setCargando(false);
    }
    // La consulta se recrea segun las dependencias declaradas por quien llama
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  useEffect(() => {
    const control = new AbortController();
    ejecutar(control.signal);
    return () => control.abort();
  }, [ejecutar]);

  return { datos, cargando, error, recargar: () => ejecutar() };
}
