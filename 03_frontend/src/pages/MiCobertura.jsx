import { useState } from 'react';
import { useRecurso } from '../hooks/useRecurso.js';
import { personal } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';

const TONO_ESTADO = {
  programado: 'neutro',
  presente: 'ok',
  ausente: 'critico',
  cubierto: 'aviso',
};

/** RF-08. Pantalla del guardia: sus turnos y la marca de asistencia. */
export function MiCobertura() {
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);
  const turnos = useRecurso(() => personal.miCobertura(), []);

  async function marcar(id, estado) {
    setError(null);
    setAviso(null);
    try {
      await personal.actualizarCobertura(id, { estado });
      setAviso(estado === 'presente' ? 'Asistencia registrada.' : 'Turno actualizado.');
      turnos.recargar();
    } catch (e) {
      setError(e);
    }
  }

  const lista = turnos.datos?.datos ?? [];
  const hoy = new Date().toISOString().slice(0, 10);
  const deHoy = lista.filter((t) => t.fecha?.slice(0, 10) === hoy);
  const proximos = lista.filter((t) => t.fecha?.slice(0, 10) > hoy);
  const pasados = lista.filter((t) => t.fecha?.slice(0, 10) < hoy);

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <h1>Mi cobertura</h1>
          <p>Turnos asignados por acceso. Marque su asistencia al iniciar el turno.</p>
        </div>
      </header>

      {aviso && <div className="estado estado--ok" role="status">{aviso}</div>}
      <MensajeError error={error} />

      {turnos.cargando && <Cargando />}
      <MensajeError error={turnos.error} onReintentar={turnos.recargar} />

      <article className="panel">
        <h2>Hoy</h2>
        {deHoy.length === 0 && <SinDatos texto="No tiene turnos asignados para hoy." />}
        <div className="rejilla-3">
          {deHoy.map((t) => (
            <div className="tarjeta-turno" key={t.id}>
              <header>
                <strong>{t.turno_nombre}</strong>
                <Etiqueta tono={TONO_ESTADO[t.estado]}>{t.estado}</Etiqueta>
              </header>
              <p>{t.hora_inicio?.slice(0, 5)} a {t.hora_fin?.slice(0, 5)}</p>
              <p className="tarjeta-turno__lugar">{t.estacion}</p>
              <p className="nota">{t.acceso} · mínimo {t.guardias_minimos} guardia(s)</p>
              {t.estado === 'programado' && (
                <div className="tarjeta-unidad__acciones">
                  <button type="button" className="boton boton--primario" onClick={() => marcar(t.id, 'presente')}>
                    Marcar presente
                  </button>
                  <button type="button" className="boton boton--secundario" onClick={() => marcar(t.id, 'ausente')}>
                    No puedo asistir
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </article>

      <article className="panel">
        <h2>Próximos turnos</h2>
        {proximos.length === 0 && <SinDatos texto="No tiene turnos programados en los próximos días." />}
        {proximos.length > 0 && <TablaTurnos filas={proximos} />}
      </article>

      {pasados.length > 0 && (
        <article className="panel">
          <h2>Turnos recientes</h2>
          <TablaTurnos filas={pasados} />
        </article>
      )}
    </section>
  );
}

function TablaTurnos({ filas }) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <thead>
          <tr><th>Fecha</th><th>Turno</th><th>Horario</th><th>Estación</th><th>Acceso</th><th>Estado</th></tr>
        </thead>
        <tbody>
          {filas.map((t) => (
            <tr key={t.id}>
              <td>{t.fecha?.slice(0, 10)}</td>
              <td>{t.turno_nombre}</td>
              <td>{t.hora_inicio?.slice(0, 5)} - {t.hora_fin?.slice(0, 5)}</td>
              <td>{t.estacion}</td>
              <td>{t.acceso}</td>
              <td><Etiqueta tono={TONO_ESTADO[t.estado]}>{t.estado}</Etiqueta></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
