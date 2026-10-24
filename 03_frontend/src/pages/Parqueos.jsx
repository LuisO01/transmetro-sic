import { useState } from 'react';
import { useRecurso } from '../hooks/useRecurso.js';
import { parqueos as apiParqueos } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';

/** RF-06: ocupacion de predios y bandeja de unidades sin parqueo. */
export function Parqueos() {
  const [predioAbierto, setPredioAbierto] = useState(null);

  const predios = useRecurso(() => apiParqueos.predios(), []);
  const pendientes = useRecurso(() => apiParqueos.sinParqueo(), []);
  const espacios = useRecurso(
    () => (predioAbierto ? apiParqueos.espacios(predioAbierto) : Promise.resolve({ datos: [] })),
    [predioAbierto],
  );

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <h1>Parqueos</h1>
          <p>Predios, ocupacion de espacios y unidades pendientes de asignacion.</p>
        </div>
      </header>

      <article className="panel">
        <h2>Unidades operativas sin parqueo (RF-06)</h2>
        {pendientes.cargando && <Cargando />}
        <MensajeError error={pendientes.error} onReintentar={pendientes.recargar} />
        {pendientes.datos?.datos?.length === 0 && (
          <SinDatos texto="Todas las unidades operativas tienen parqueo asignado." />
        )}
        {pendientes.datos?.datos?.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Economico</th>
                  <th>Placa</th>
                  <th>Tipo</th>
                  <th>Linea</th>
                  <th>Municipalidad</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.datos.datos.map((b) => (
                  <tr key={b.bus_id}>
                    <td>{b.numero_economico}</td>
                    <td>{b.placa}</td>
                    <td>{b.tipo}</td>
                    <td>{b.linea_codigo ?? '-'}</td>
                    <td>{b.municipalidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel">
        <h2>Predios</h2>
        {predios.cargando && <Cargando />}
        <MensajeError error={predios.error} onReintentar={predios.recargar} />
        {predios.datos?.datos?.length === 0 && <SinDatos texto="No hay predios registrados." />}

        <div className="rejilla-3">
          {predios.datos?.datos?.map((p) => {
            const total = Number(p.espacios_totales) || 0;
            const ocupados = Number(p.espacios_ocupados) || 0;
            const porcentaje = total ? Math.round((ocupados / total) * 100) : 0;
            return (
              <button
                type="button"
                key={p.id}
                className={`tarjeta-predio${predioAbierto === p.id ? ' tarjeta-predio--activa' : ''}`}
                onClick={() => setPredioAbierto(predioAbierto === p.id ? null : p.id)}
              >
                <strong>{p.nombre}</strong>
                <small>{p.municipalidad}</small>
                <div className="barra" aria-hidden="true">
                  <div className="barra__relleno" style={{ width: `${porcentaje}%` }} />
                </div>
                <span>{ocupados} / {total} espacios ocupados ({porcentaje} %)</span>
              </button>
            );
          })}
        </div>
      </article>

      {predioAbierto && (
        <article className="panel">
          <h2>Espacios del predio</h2>
          {espacios.cargando && <Cargando />}
          <MensajeError error={espacios.error} onReintentar={espacios.recargar} />
          <ul className="rejilla-espacios">
            {espacios.datos?.datos?.map((e) => (
              <li key={e.id} className={`espacio espacio--${e.bus_id ? 'ocupado' : e.estado}`}>
                <strong>{e.codigo}</strong>
                {e.bus_id ? (
                  <small>{e.numero_economico}</small>
                ) : (
                  <Etiqueta tono={e.estado === 'disponible' ? 'ok' : 'neutro'}>{e.estado}</Etiqueta>
                )}
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}
