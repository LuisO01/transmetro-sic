import { useAuth } from '../store/AuthContext.jsx';

/**
 * Renderiza a sus hijos solo si el usuario alcanza el nivel exigido sobre el
 * modulo (RF-15). Sirve para ocultar botones de escritura a los perfiles de
 * solo lectura; la autorizacion real siempre la vuelve a validar la API.
 *
 *   <Puede modulo={MODULOS.FLOTA} nivel="E">
 *     <button>Asignar unidad</button>
 *   </Puede>
 */
export function Puede({ modulo, nivel = 'L', children, alternativa = null }) {
  const { puede } = useAuth();
  return puede(modulo, nivel) ? children : alternativa;
}
