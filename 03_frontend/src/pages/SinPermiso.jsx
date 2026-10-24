import { Link, useLocation } from 'react-router-dom';
import { ETIQUETA_MODULO, ETIQUETA_NIVEL } from '../utils/constantes.js';

export function SinPermiso() {
  const { state } = useLocation();

  return (
    <section className="pagina-mensaje">
      <h1>Sin permiso</h1>
      <p>
        Su perfil no tiene acceso a
        {' '}
        <strong>{ETIQUETA_MODULO[state?.modulo] ?? state?.modulo ?? 'este modulo'}</strong>
        {state?.nivel ? ` con nivel ${ETIQUETA_NIVEL[state.nivel] ?? state.nivel}` : ''}.
      </p>
      <p>Si necesita este acceso, solicitelo al administrador de su municipalidad.</p>
      <Link to="/" className="boton boton--primario">Volver al tablero</Link>
    </section>
  );
}

export function NoEncontrado() {
  return (
    <section className="pagina-mensaje">
      <h1>Pagina no encontrada</h1>
      <p>La direccion solicitada no existe dentro del sistema.</p>
      <Link to="/" className="boton boton--primario">Volver al tablero</Link>
    </section>
  );
}
