import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useRecurso } from '../hooks/useRecurso.js';
import { lineas as apiLineas, estaciones as apiEstaciones } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';
import { Puede } from '../components/Puede.jsx';
import { MODULOS, SITUACION_LINEA } from '../utils/constantes.js';

/**
 * RF-01: relacion linea-estacion con orden de recorrido.
 * RF-02: distancia entre estaciones y longitud total de la linea.
 */
export function LineaDetalle() {
  const { id } = useParams();
  const [sentido, setSentido] = useState('ida');
  const [nuevoTramo, setNuevoTramo] = useState(null);
  const [errorForm, setErrorForm] = useState(null);

  const linea = useRecurso(() => apiLineas.obtener(id), [id]);
  const recorrido = useRecurso(() => apiLineas.recorrido(id, sentido), [id, sentido]);
  const unidades = useRecurso(() => apiLineas.unidades(id), [id]);
  const catalogo = useRecurso(() => apiEstaciones.listar({ limite: 200 }), []);

  const datosLinea = linea.datos?.datos;
  const datosRecorrido = recorrido.datos?.datos;
  const datosUnidades = unidades.datos?.datos;

  async function agregarTramo(evento) {
    evento.preventDefault();
    setErrorForm(null);
    try {
      await apiLineas.agregarTramo(id, {
        estacionId: Number(nuevoTramo.estacionId),
        sentido,
        ordenRecorrido: Number(nuevoTramo.ordenRecorrido),
        distanciaKmSiguiente: nuevoTramo.distanciaKmSiguiente
          ? Number(nuevoTramo.distanciaKmSiguiente)
          : undefined,
        tiempoEstimadoMin: nuevoTramo.tiempoEstimadoMin
          ? Number(nuevoTramo.tiempoEstimadoMin)
          : undefined,
      });
      setNuevoTramo(null);
      recorrido.recargar();
      linea.recargar();
    } catch (e) {
      setErrorForm(e);
    }
  }

  async function quitarTramo(tramoId) {
    setErrorForm(null);
    try {
      await apiLineas.quitarTramo(id, tramoId);
      recorrido.recargar();
      linea.recargar();
    } catch (e) {
      setErrorForm(e);
    }
  }

  if (linea.cargando) return <Cargando />;
  if (linea.error) return <MensajeError error={linea.error} onReintentar={linea.recargar} />;

  const situacion = SITUACION_LINEA[datosUnidades?.situacion] ?? SITUACION_LINEA.sin_evaluar;

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <p className="migas"><Link to="/lineas">Lineas</Link> / {datosLinea?.codigo}</p>
          <h1>
            <span className="punto" style={{ background: datosLinea?.color_hex }} aria-hidden="true" />
            {datosLinea?.codigo} - {datosLinea?.nombre}
          </h1>
          <p>
            {datosLinea?.municipalidad} - {datosLinea?.tipo} - estado {datosLinea?.estado}
          </p>
        </div>
      </header>

      <div className="rejilla-3">
        <div className="indicador">
          <small>Longitud del recorrido ({sentido})</small>
          <strong>{datosRecorrido?.longitudKm?.toFixed(3) ?? '0.000'} km</strong>
          <span>RF-02</span>
        </div>
        <div className="indicador">
          <small>Estaciones</small>
          <strong>{datosRecorrido?.totalEstaciones ?? 0}</strong>
          <span>Tiempo estimado {datosRecorrido?.tiempoEstimadoMin ?? 0} min</span>
        </div>
        <div className="indicador">
          <small>Unidades operativas</small>
          <strong>
            {datosUnidades?.unidades_operativas ?? 0} / {datosLinea?.unidades_minimas}-
            {datosLinea?.unidades_maximas}
          </strong>
          <Etiqueta tono={situacion.tono}>{situacion.texto}</Etiqueta>
        </div>
      </div>

      <article className="panel">
        <header className="panel__cabecera">
          <h2>Recorrido y distancias (RF-01 / RF-02)</h2>
          <div className="acciones">
            <div className="conmutador">
              <button
                type="button"
                className={sentido === 'ida' ? 'activo' : ''}
                onClick={() => setSentido('ida')}
              >
                Ida
              </button>
              <button
                type="button"
                className={sentido === 'vuelta' ? 'activo' : ''}
                onClick={() => setSentido('vuelta')}
              >
                Vuelta
              </button>
            </div>
            <Puede modulo={MODULOS.LINEAS_ESTACIONES} nivel="E">
              <button
                type="button"
                className="boton boton--primario"
                onClick={() => setNuevoTramo(
                  nuevoTramo
                    ? null
                    : {
                      estacionId: '',
                      ordenRecorrido: (datosRecorrido?.totalEstaciones ?? 0) + 1,
                      distanciaKmSiguiente: '',
                      tiempoEstimadoMin: '',
                    },
                )}
              >
                {nuevoTramo ? 'Cancelar' : 'Agregar estacion'}
              </button>
            </Puede>
          </div>
        </header>

        <MensajeError error={errorForm} />

        {nuevoTramo && (
          <form className="formulario formulario--embebido" onSubmit={agregarTramo}>
            <div className="rejilla-formulario">
              <label className="campo">
                <span>Estacion</span>
                <select
                  value={nuevoTramo.estacionId}
                  onChange={(e) => setNuevoTramo({ ...nuevoTramo, estacionId: e.target.value })}
                  required
                >
                  <option value="">Seleccione...</option>
                  {catalogo.datos?.items?.map((e) => (
                    <option key={e.id} value={e.id}>{e.codigo} - {e.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Orden</span>
                <input
                  type="number"
                  min={1}
                  value={nuevoTramo.ordenRecorrido}
                  onChange={(e) => setNuevoTramo({ ...nuevoTramo, ordenRecorrido: e.target.value })}
                  required
                />
              </label>
              <label className="campo">
                <span>Distancia a la siguiente (km)</span>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={nuevoTramo.distanciaKmSiguiente}
                  onChange={(e) => setNuevoTramo({ ...nuevoTramo, distanciaKmSiguiente: e.target.value })}
                  placeholder="Vacio si es terminal"
                />
              </label>
              <label className="campo">
                <span>Tiempo estimado (min)</span>
                <input
                  type="number"
                  min={1}
                  value={nuevoTramo.tiempoEstimadoMin}
                  onChange={(e) => setNuevoTramo({ ...nuevoTramo, tiempoEstimadoMin: e.target.value })}
                />
              </label>
            </div>
            <button type="submit" className="boton boton--primario">Agregar al recorrido</button>
          </form>
        )}

        {recorrido.cargando && <Cargando />}
        {datosRecorrido?.estaciones?.length === 0 && (
          <SinDatos texto="La linea aun no tiene estaciones en este sentido." />
        )}

        {datosRecorrido?.estaciones?.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Estacion</th>
                  <th>Tipo</th>
                  <th>Municipalidad</th>
                  <th className="num">Distancia siguiente (km)</th>
                  <th className="num">Tiempo (min)</th>
                  <th>Siguiente</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {datosRecorrido.estaciones.map((e) => (
                  <tr key={e.linea_estacion_id}>
                    <td className="num">{e.orden_recorrido}</td>
                    <td>
                      <Link to={`/estaciones/${e.estacion_id}`}>{e.estacion_codigo}</Link>{' '}
                      {e.estacion_nombre}
                    </td>
                    <td>{e.estacion_tipo}</td>
                    <td>{e.municipalidad}</td>
                    <td className="num">{e.distancia_km_siguiente ?? '-'}</td>
                    <td className="num">{e.tiempo_estimado_min ?? '-'}</td>
                    <td>{e.estacion_siguiente ?? 'Terminal'}</td>
                    <td>
                      <Puede modulo={MODULOS.LINEAS_ESTACIONES} nivel="E">
                        <button
                          type="button"
                          className="boton boton--texto"
                          onClick={() => quitarTramo(e.linea_estacion_id)}
                        >
                          Quitar
                        </button>
                      </Puede>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Longitud total del sentido {sentido}</td>
                  <td className="num"><strong>{datosRecorrido.longitudKm.toFixed(3)}</strong></td>
                  <td className="num"><strong>{datosRecorrido.tiempoEstimadoMin}</strong></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </article>

      <article className="panel">
        <h2>Unidades asignadas (RF-04)</h2>
        {unidades.cargando && <Cargando />}
        <MensajeError error={unidades.error} onReintentar={unidades.recargar} />
        {datosUnidades?.unidades?.length === 0 && (
          <SinDatos texto="La linea no tiene unidades asignadas." />
        )}
        {datosUnidades?.unidades?.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Economico</th>
                  <th>Placa</th>
                  <th>Tipo</th>
                  <th className="num">Capacidad</th>
                  <th>Estado</th>
                  <th>Asignada desde</th>
                </tr>
              </thead>
              <tbody>
                {datosUnidades.unidades.map((b) => (
                  <tr key={b.id}>
                    <td><Link to={`/flota/${b.id}`}>{b.numero_economico}</Link></td>
                    <td>{b.placa}</td>
                    <td>{b.tipo}</td>
                    <td className="num">{b.capacidad_total}</td>
                    <td>{b.estado}</td>
                    <td>{new Date(b.fecha_inicio).toLocaleDateString('es-GT')}</td>
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
