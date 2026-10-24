import { useRecurso } from '../hooks/useRecurso.js';
import { personal, monitoreo } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';

/** RF-07. Pantalla del piloto: su propio expediente y sus viajes recientes. */
export function MiExpediente() {
  const expediente = useRecurso(() => personal.miExpediente(), []);
  const viajes = useRecurso(() => monitoreo.misViajes(), []);

  if (expediente.cargando) return <Cargando />;
  if (expediente.error) {
    return <MensajeError error={expediente.error} onReintentar={expediente.recargar} />;
  }

  const p = expediente.datos?.datos;
  const listaViajes = viajes.datos?.datos ?? [];

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <h1>Mi expediente</h1>
          <p>Datos personales, licencia e historial. Si algo está incorrecto, repórtelo a su administrador.</p>
        </div>
      </header>

      <div className="rejilla-3">
        <div className="indicador">
          <small>Código de piloto</small>
          <strong>{p.codigo_piloto}</strong>
          <span>Ingreso: {p.fecha_ingreso?.slice(0, 10)}</span>
        </div>
        <div className={`indicador${p.licencia_vencida ? ' indicador--critico' : ''}`}>
          <small>Licencia tipo {p.tipo_licencia}</small>
          <strong>{p.numero_licencia}</strong>
          <span>
            Vence: {p.vigencia_licencia?.slice(0, 10)}{' '}
            {p.licencia_vencida && <Etiqueta tono="critico">Vencida</Etiqueta>}
          </span>
        </div>
        <div className="indicador">
          <small>Estado laboral</small>
          <strong style={{ fontSize: '1.2rem' }}>{p.estado}</strong>
          <span>{p.municipalidad}</span>
        </div>
      </div>

      <article className="panel">
        <h2>Datos personales</h2>
        <dl className="lista-datos">
          <div><dt>Nombre</dt><dd>{p.nombres} {p.apellidos}</dd></div>
          <div><dt>DPI</dt><dd>{p.dpi}</dd></div>
          <div><dt>Fecha de nacimiento</dt><dd>{p.fecha_nacimiento?.slice(0, 10) ?? 'No registrada'}</dd></div>
          <div><dt>Teléfono</dt><dd>{p.telefono ?? 'No registrado'}</dd></div>
          <div><dt>Teléfono de emergencia</dt><dd>{p.telefono_emergencia ?? 'No registrado'}</dd></div>
          <div><dt>Correo</dt><dd>{p.correo ?? 'No registrado'}</dd></div>
          <div><dt>Residencia</dt><dd>{p.direccion_residencia ?? 'No registrada'}</dd></div>
          <div><dt>Municipio</dt><dd>{p.municipio_residencia ?? 'No registrado'}</dd></div>
        </dl>
      </article>

      <article className="panel">
        <h2>Historial educativo</h2>
        {p.educacion.length === 0 && <SinDatos texto="No hay estudios registrados en su expediente." />}
        {p.educacion.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr><th>Nivel</th><th>Institución</th><th>Título</th><th className="num">Periodo</th></tr>
              </thead>
              <tbody>
                {p.educacion.map((e) => (
                  <tr key={e.id}>
                    <td>{e.nivel}</td>
                    <td>{e.institucion}</td>
                    <td>{e.titulo_obtenido ?? '-'}</td>
                    <td className="num">{e.anio_inicio ?? '?'} - {e.anio_fin ?? '?'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel">
        <h2>Mis viajes recientes</h2>
        {viajes.cargando && <Cargando />}
        {!viajes.cargando && listaViajes.length === 0 && (
          <SinDatos texto="Aún no tiene viajes registrados a su nombre." />
        )}
        {listaViajes.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th><th>Línea</th><th>Unidad</th><th>Estación de origen</th>
                  <th>Sentido</th><th className="num">Ocupación</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {listaViajes.map((v) => (
                  <tr key={v.id}>
                    <td>{new Date(v.fecha_hora_llegada).toLocaleString('es-GT')}</td>
                    <td>
                      <span className="chip-linea" style={{ background: v.color_hex }}>{v.linea_codigo}</span>
                    </td>
                    <td>{v.numero_economico}</td>
                    <td>{v.estacion_origen}</td>
                    <td>{v.sentido}</td>
                    <td className="num">
                      {v.ocupacion_salida_pct ? `${Number(v.ocupacion_salida_pct).toFixed(1)} %` : '-'}
                    </td>
                    <td>{v.estado}</td>
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
