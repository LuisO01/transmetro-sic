/** Componentes pequenos y reutilizables de estado de pantalla. */

export function Cargando({ texto = 'Cargando...' }) {
  return (
    <div className="estado estado--cargando" role="status" aria-live="polite">
      {texto}
    </div>
  );
}

export function MensajeError({ error, onReintentar }) {
  if (!error) return null;
  return (
    <div className="estado estado--error" role="alert">
      <strong>{error.mensaje ?? 'Ocurrio un error.'}</strong>
      {Array.isArray(error.detalle) && (
        <ul>
          {error.detalle.map((d, i) => (
            <li key={i}>
              {d.campo ? `${d.campo}: ` : ''}
              {d.mensaje}
            </li>
          ))}
        </ul>
      )}
      {onReintentar && (
        <button type="button" className="boton boton--secundario" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function SinDatos({ texto = 'No hay registros que mostrar.' }) {
  return <div className="estado estado--vacio">{texto}</div>;
}

export function Etiqueta({ tono = 'neutro', children }) {
  return <span className={`etiqueta etiqueta--${tono}`}>{children}</span>;
}
