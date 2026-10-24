import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';
import { Cargando } from '../components/Estado.jsx';

/**
 * Protege una ruta por autenticacion y, opcionalmente, por nivel de permiso
 * sobre un modulo (RF-15).
 */
export function RutaProtegida({ modulo, nivel = 'L', children }) {
  const { autenticado, cargando, puede } = useAuth();
  const ubicacion = useLocation();

  if (cargando) return <Cargando texto="Verificando sesion..." />;

  if (!autenticado) {
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  }

  if (modulo && !puede(modulo, nivel)) {
    return <Navigate to="/sin-permiso" replace state={{ modulo, nivel }} />;
  }

  return children;
}
