import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { autenticacion } from '../api/endpoints.js';
import { almacenTokens } from '../api/cliente.js';

const AuthContext = createContext(null);

/** Jerarquia de niveles de la matriz de permisos: L < E < A. */
const ORDEN_NIVEL = { L: 1, E: 2, A: 3 };

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al montar, si hay token guardado se recupera el perfil para no perder la
  // sesion al recargar la pagina.
  useEffect(() => {
    let cancelado = false;

    async function recuperarSesion() {
      if (!almacenTokens.acceso && !almacenTokens.refresco) {
        setCargando(false);
        return;
      }
      try {
        const { datos } = await autenticacion.perfil();
        if (!cancelado) setUsuario(normalizar(datos));
      } catch {
        almacenTokens.limpiar();
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    recuperarSesion();
    return () => {
      cancelado = true;
    };
  }, []);

  const iniciarSesion = useCallback(async (nombreUsuario, password) => {
    const { datos } = await autenticacion.login(nombreUsuario, password);
    almacenTokens.guardar(datos);
    setUsuario(normalizar(datos.usuario));
    return datos.usuario;
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await autenticacion.logout(almacenTokens.refresco);
    } catch {
      // Cerrar sesion nunca debe bloquear al usuario aunque falle la llamada
    }
    almacenTokens.limpiar();
    setUsuario(null);
  }, []);

  /** RF-15: nivel efectivo del usuario sobre un modulo. */
  const nivelEn = useCallback(
    (modulo) => usuario?.permisos?.[modulo] ?? null,
    [usuario],
  );

  /** ¿El usuario alcanza el nivel exigido sobre el modulo? */
  const puede = useCallback(
    (modulo, nivelRequerido = 'L') => {
      const actual = usuario?.permisos?.[modulo];
      if (!actual) return false;
      return ORDEN_NIVEL[actual] >= ORDEN_NIVEL[nivelRequerido];
    },
    [usuario],
  );

  const valor = useMemo(
    () => ({
      usuario,
      cargando,
      autenticado: Boolean(usuario),
      iniciarSesion,
      cerrarSesion,
      puede,
      nivelEn,
    }),
    [usuario, cargando, iniciarSesion, cerrarSesion, puede, nivelEn],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

/** La API devuelve snake_case en el perfil y camelCase en el login. */
function normalizar(datos) {
  return {
    id: datos.id,
    username: datos.username,
    correo: datos.correo,
    nombreCompleto: datos.nombreCompleto ?? datos.nombre_completo,
    municipalidadId: datos.municipalidadId ?? datos.municipalidad_id ?? null,
    municipalidad: datos.municipalidad ?? null,
    estacionId: datos.estacionId ?? datos.estacion_id ?? null,
    estacion: datos.estacion ?? null,
    debeCambiarPassword: datos.debeCambiarPassword ?? datos.debe_cambiar_password ?? false,
    roles: datos.roles ?? [],
    permisos: datos.permisos ?? {},
    ambito: datos.ambito ?? 'propio',
  };
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return contexto;
}
