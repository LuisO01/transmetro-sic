import { useRecurso } from '../hooks/useRecurso.js';
import { usuarios as apiUsuarios } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';
import { ETIQUETA_MODULO, ETIQUETA_NIVEL } from '../utils/constantes.js';

/** RF-15: administracion de usuarios y visualizacion de la matriz de permisos. */
export function Usuarios() {
  const lista = useRecurso(() => apiUsuarios.listar({ limite: 100 }), []);
  const matriz = useRecurso(() => apiUsuarios.matrizPermisos(), []);

  // La API devuelve filas rol x modulo; aqui se pivotea para mostrarla como tabla
  const roles = [...new Set(matriz.datos?.datos?.map((f) => f.rol) ?? [])];
  const modulos = [...new Set(matriz.datos?.datos?.map((f) => f.modulo) ?? [])];
  const nivelDe = (rol, modulo) => matriz.datos?.datos
    ?.find((f) => f.rol === rol && f.modulo === modulo)?.nivel ?? null;

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <h1>Usuarios y roles</h1>
          <p>Cuentas del sistema y matriz de permisos vigente.</p>
        </div>
      </header>

      <article className="panel">
        <h2>Cuentas</h2>
        {lista.cargando && <Cargando />}
        <MensajeError error={lista.error} onReintentar={lista.recargar} />
        {lista.datos?.items?.length === 0 && <SinDatos />}

        {lista.datos?.items?.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Roles</th>
                  <th>Municipalidad</th>
                  <th>Estacion</th>
                  <th>Estado</th>
                  <th>Ultimo acceso</th>
                </tr>
              </thead>
              <tbody>
                {lista.datos.items.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.nombre_completo}</td>
                    <td>{u.roles?.join(', ')}</td>
                    <td>{u.municipalidad ?? '-'}</td>
                    <td>{u.estacion ?? '-'}</td>
                    <td>
                      <Etiqueta tono={u.estado === 'activo' ? 'ok' : 'critico'}>{u.estado}</Etiqueta>
                    </td>
                    <td>
                      {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-GT') : 'Nunca'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel">
        <h2>Matriz de permisos (RF-15)</h2>
        <p className="nota">
          L = lectura, E = escritura dentro de su ambito, A = administracion total,
          guion = sin acceso.
        </p>
        {matriz.cargando && <Cargando />}
        <MensajeError error={matriz.error} onReintentar={matriz.recargar} />

        {roles.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla tabla--matriz">
              <thead>
                <tr>
                  <th>Modulo</th>
                  {roles.map((r) => <th key={r}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {modulos.map((m) => (
                  <tr key={m}>
                    <th scope="row">{ETIQUETA_MODULO[m] ?? m}</th>
                    {roles.map((r) => {
                      const nivel = nivelDe(r, m);
                      return (
                        <td key={`${r}-${m}`} className="celda-nivel">
                          <span
                            className={`nivel nivel--${nivel ?? 'sin'}`}
                            title={nivel ? ETIQUETA_NIVEL[nivel] : 'Sin acceso'}
                          >
                            {nivel ?? '-'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
