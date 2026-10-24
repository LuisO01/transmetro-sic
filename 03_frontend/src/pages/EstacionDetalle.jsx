import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useRecurso } from '../hooks/useRecurso.js';
import { estaciones as apiEstaciones } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';
import { Puede } from '../components/Puede.jsx';
import { MODULOS } from '../utils/constantes.js';

const ACCESO_VACIO = {
  codigo: '',
  nombre: '',
  tipo: 'peatonal',
  torniquetes: 2,
  guardiasMinimos: 1,
};

/** RF-03: inventario de accesos por estacion. RF-08: minimo de guardias. */
export function EstacionDetalle() {
  const { id } = useParams();
  const [formulario, setFormulario] = useState(null);
  const [errorForm, setErrorForm] = useState(null);

  const estacion = useRecurso(() => apiEstaciones.obtener(id), [id]);
  const datos = estacion.datos?.datos;

  async function guardarAcceso(evento) {
    evento.preventDefault();
    setErrorForm(null);
    try {
      await apiEstaciones.crearAcceso(id, {
        ...formulario,
        torniquetes: Number(formulario.torniquetes),
        guardiasMinimos: Number(formulario.guardiasMinimos),
      });
      setFormulario(null);
      estacion.recargar();
    } catch (e) {
      setErrorForm(e);
    }
  }

  if (estacion.cargando) return <Cargando />;
  if (estacion.error) return <MensajeError error={estacion.error} onReintentar={estacion.recargar} />;

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <p className="migas"><Link to="/estaciones">Estaciones</Link> / {datos?.codigo}</p>
          <h1>{datos?.codigo} - {datos?.nombre}</h1>
          <p>
            {datos?.municipalidad} - {datos?.tipo} - estado {datos?.estado} - capacidad{' '}
            {datos?.capacidad_personas} personas
          </p>
        </div>
      </header>

      <article className="panel">
        <h2>Lineas que atienden la estacion</h2>
        {datos?.lineas?.length === 0 && <SinDatos texto="La estacion no forma parte de ningun recorrido." />}
        {datos?.lineas?.length > 0 && (
          <ul className="lista-chips">
            {datos.lineas.map((l) => (
              <li key={`${l.id}-${l.sentido}`}>
                <Link to={`/lineas/${l.id}`} className="chip">
                  <span className="punto" style={{ background: l.color_hex }} aria-hidden="true" />
                  {l.codigo} ({l.sentido}, orden {l.orden_recorrido})
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="panel">
        <header className="panel__cabecera">
          <h2>Inventario de accesos (RF-03)</h2>
          <Puede modulo={MODULOS.LINEAS_ESTACIONES} nivel="E">
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => setFormulario(formulario ? null : ACCESO_VACIO)}
            >
              {formulario ? 'Cancelar' : 'Nuevo acceso'}
            </button>
          </Puede>
        </header>

        <MensajeError error={errorForm} />

        {formulario && (
          <form className="formulario formulario--embebido" onSubmit={guardarAcceso}>
            <div className="rejilla-formulario">
              <label className="campo">
                <span>Codigo</span>
                <input
                  value={formulario.codigo}
                  onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value.toUpperCase() })}
                  required
                  maxLength={20}
                />
              </label>
              <label className="campo">
                <span>Nombre</span>
                <input
                  value={formulario.nombre}
                  onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                  required
                  minLength={3}
                />
              </label>
              <label className="campo">
                <span>Tipo</span>
                <select
                  value={formulario.tipo}
                  onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })}
                >
                  <option value="peatonal">Peatonal</option>
                  <option value="pasarela">Pasarela</option>
                  <option value="rampa">Rampa</option>
                  <option value="vehicular">Vehicular</option>
                  <option value="emergencia">Emergencia</option>
                </select>
              </label>
              <label className="campo">
                <span>Torniquetes</span>
                <input
                  type="number"
                  min={0}
                  value={formulario.torniquetes}
                  onChange={(e) => setFormulario({ ...formulario, torniquetes: e.target.value })}
                />
              </label>
              <label className="campo">
                <span>Guardias minimos (RF-08)</span>
                <input
                  type="number"
                  min={0}
                  value={formulario.guardiasMinimos}
                  onChange={(e) => setFormulario({ ...formulario, guardiasMinimos: e.target.value })}
                />
              </label>
            </div>
            <button type="submit" className="boton boton--primario">Guardar acceso</button>
          </form>
        )}

        {datos?.accesos?.length === 0 && <SinDatos texto="La estacion aun no tiene accesos registrados." />}
        {datos?.accesos?.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th className="num">Torniquetes</th>
                  <th className="num">Guardias minimos</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.accesos.map((a) => (
                  <tr key={a.id}>
                    <td>{a.codigo}</td>
                    <td>{a.nombre}</td>
                    <td>{a.tipo}</td>
                    <td className="num">{a.torniquetes}</td>
                    <td className="num">{a.guardias_minimos}</td>
                    <td>
                      <Etiqueta tono={a.estado === 'habilitado' ? 'ok' : 'aviso'}>{a.estado}</Etiqueta>
                    </td>
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
