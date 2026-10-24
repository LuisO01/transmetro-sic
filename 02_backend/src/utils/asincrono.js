/**
 * Envoltura para controladores async: reenvia cualquier rechazo al middleware
 * de errores, evitando try/catch repetido en cada controlador.
 * @param {Function} manejador
 */
export const asincrono = (manejador) => (req, res, next) => {
  Promise.resolve(manejador(req, res, next)).catch(next);
};

/** Normaliza los parametros de paginacion de las listas. */
export function paginacion(query, porDefecto = 25, maximo = 200) {
  const limite = Math.min(Math.max(Number(query.limite ?? porDefecto) || porDefecto, 1), maximo);
  const pagina = Math.max(Number(query.pagina ?? 1) || 1, 1);
  return { limite, desplazamiento: (pagina - 1) * limite, pagina };
}
