import { useState } from 'react';
import { useRecurso } from '../hooks/useRecurso.js';
import { personal } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';
import { Puede } from '../components/Puede.jsx';
import { MODULOS } from '../utils/constantes.js';

/** RF-07 y RF-08. Pantalla del administrador: pilotos, guardias y coberturas. */
export function Personal() {
  const [pestana, setPestana] = useState('pilotos');
  const [texto, setTexto] = useState('');
  const [expediente, setExpediente] = useState(null);
  const [error, setError] = useState(null);

  const resumen = useRecurso(() => personal.resumen(), []);
  const pilotos = useRecurso(() => personal.pilotos({ texto: texto || undefined }), [texto]);
  const guardias = useRecurso(() => personal.guardias({ texto: texto || undefined }), [texto]);
  const cobertura = useRecurso(() => personal.cobertura({ soloIncumplidos: true }), []);

  const r = resumen.datos?.datos;

  async function abrirExpediente(id) {
    setError(null);
    try {
      const { datos } = await personal.expediente(id);
      setExpediente(datos);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <h1>Personal</h1>
          <p>Expedientes de pilotos, guardias de seguridad y cobertura por acceso.</p>
        </div>
      </header>

      {r && (
        <div className="rejilla-4">
          <div className="indicador">
            <small>Pilotos activos</small><strong>{r.pilotos_activos}</strong>
          </div>
          <div className={`indicador${r.licencias_por_vencer > 0 ? ' indicador--aviso' : ''}`}>
            <small>Licencias por vencer</small><strong>{r.licencias_por_vencer}</strong>
            <span>En los próximos 60 días</span>
          </div>
          <div className="indicador">
            <small>Guardias activos</small><strong>{r.guardias_activos}</strong>
          </div>
          <div className={`indicador${r.turnos_descubiertos_hoy > 0 ? ' indicador--critico' : ''}`}>
            <small>Turnos descubiertos hoy</small><strong>{r.turnos_descubiertos_hoy}</strong>
            <span>RF-08</span>
          </div>
        </div>
      )}

      <MensajeError error={error} />

      <div className="pestanas">
        {[['pilotos', 'Pilotos'], ['guardias', 'Guardias'], ['cobertura', 'Cobertura pendiente']].map(([id, etiqueta]) => (
          <button
            key={id}
            type="button"
            className={pestana === id ? 'activo' : ''}
            onClick={() => setPestana(id)}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {pestana !== 'cobertura' && (
        <div className="filtros">
          <label className="campo campo--linea">
            <span>Buscar</span>
            <input
              type="search"
              value={texto}
              placeholder="Nombre, código o DPI"
              onChange={(e) => setTexto(e.target.value)}
            />
          </label>
        </div>
      )}

      {pestana === 'pilotos' && (
        <article className="panel">
          {pilotos.cargando && <Cargando />}
          <MensajeError error={pilotos.error} onReintentar={pilotos.recargar} />
          {pilotos.datos?.datos?.length === 0 && <SinDatos />}
          {pilotos.datos?.datos?.length > 0 && (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Código</th><th>Nombre</th><th>DPI</th><th>Licencia</th>
                    <th>Vigencia</th><th>Estado</th><th className="num">Viajes</th><th />
                  </tr>
                </thead>
                <tbody>
                  {pilotos.datos.datos.map((p) => (
                    <tr key={p.persona_id}>
                      <td>{p.codigo_piloto}</td>
                      <td>{p.nombres} {p.apellidos}</td>
                      <td>{p.dpi}</td>
                      <td>{p.numero_licencia} ({p.tipo_licencia})</td>
                      <td>
                        {p.vigencia_licencia?.slice(0, 10)}{' '}
                        {p.licencia_vencida && <Etiqueta tono="critico">Vencida</Etiqueta>}
                        {!p.licencia_vencida && p.licencia_por_vencer && <Etiqueta tono="aviso">Por vencer</Etiqueta>}
                      </td>
                      <td><Etiqueta tono={p.estado === 'activo' ? 'ok' : 'neutro'}>{p.estado}</Etiqueta></td>
                      <td className="num">{p.viajes}</td>
                      <td>
                        <button type="button" className="boton boton--texto" onClick={() => abrirExpediente(p.persona_id)}>
                          Ver expediente
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}

      {pestana === 'guardias' && (
        <article className="panel">
          {guardias.cargando && <Cargando />}
          <MensajeError error={guardias.error} onReintentar={guardias.recargar} />
          {guardias.datos?.datos?.length === 0 && <SinDatos />}
          {guardias.datos?.datos?.length > 0 && (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Código</th><th>Nombre</th><th>Empresa</th><th>Credencial</th>
                    <th>Ingreso</th><th>Estado</th><th className="num">Turnos programados</th>
                  </tr>
                </thead>
                <tbody>
                  {guardias.datos.datos.map((g) => (
                    <tr key={g.persona_id}>
                      <td>{g.codigo_guardia}</td>
                      <td>{g.nombres} {g.apellidos}</td>
                      <td>{g.empresa_seguridad ?? '-'}</td>
                      <td>{g.numero_credencial ?? '-'}</td>
                      <td>{g.fecha_ingreso?.slice(0, 10)}</td>
                      <td><Etiqueta tono={g.estado === 'activo' ? 'ok' : 'neutro'}>{g.estado}</Etiqueta></td>
                      <td className="num">{g.turnos_programados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}

      {pestana === 'cobertura' && (
        <article className="panel">
          <h2>Turnos que no alcanzan el mínimo (RF-08)</h2>
          <p className="nota">
            Ventana de siete días. Cada fila es un acceso cuyo turno no llega al mínimo de guardias exigido.
          </p>
          {cobertura.cargando && <Cargando />}
          <MensajeError error={cobertura.error} onReintentar={cobertura.recargar} />
          {cobertura.datos?.datos?.length === 0 && (
            <SinDatos texto="Toda la cobertura programada alcanza el mínimo." />
          )}
          {cobertura.datos?.datos?.length > 0 && (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha</th><th>Estación</th><th>Acceso</th><th>Turno</th>
                    <th className="num">Asignados</th><th className="num">Requeridos</th>
                  </tr>
                </thead>
                <tbody>
                  {cobertura.datos.datos.slice(0, 40).map((c, i) => (
                    <tr key={`${c.acceso_id}-${c.fecha}-${c.turno_id}-${i}`}>
                      <td>{c.fecha?.slice(0, 10)}</td>
                      <td>{c.estacion}</td>
                      <td>{c.acceso}</td>
                      <td>{c.turno}</td>
                      <td className="num">{c.asignados}</td>
                      <td className="num">{c.requeridos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Puede modulo={MODULOS.PERSONAL} nivel="E">
            <p className="nota">
              La programación de turnos se realiza desde el detalle de cada acceso de la estación.
            </p>
          </Puede>
        </article>
      )}

      {expediente && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Expediente del piloto">
          <div className="modal__panel modal__panel--ancho">
            <h2>{expediente.nombres} {expediente.apellidos}</h2>
            <p className="nota">
              {expediente.codigo_piloto} · licencia {expediente.numero_licencia} tipo {expediente.tipo_licencia}
            </p>
            <dl className="lista-datos">
              <div><dt>DPI</dt><dd>{expediente.dpi}</dd></div>
              <div><dt>Teléfono</dt><dd>{expediente.telefono ?? '-'}</dd></div>
              <div><dt>Emergencia</dt><dd>{expediente.telefono_emergencia ?? '-'}</dd></div>
              <div><dt>Residencia</dt><dd>{expediente.direccion_residencia ?? '-'}</dd></div>
              <div><dt>Municipio</dt><dd>{expediente.municipio_residencia ?? '-'}</dd></div>
              <div><dt>Ingreso</dt><dd>{expediente.fecha_ingreso?.slice(0, 10)}</dd></div>
            </dl>
            <h3>Historial educativo</h3>
            {expediente.educacion.length === 0 ? (
              <SinDatos texto="Sin estudios registrados." />
            ) : (
              <ul className="lista-simple">
                {expediente.educacion.map((e) => (
                  <li key={e.id}>
                    {e.nivel} · {e.institucion} {e.titulo_obtenido ? `· ${e.titulo_obtenido}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <div className="modal__acciones">
              <button type="button" className="boton boton--secundario" onClick={() => setExpediente(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
