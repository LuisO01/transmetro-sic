import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecurso } from '../hooks/useRecurso.js';
import { estaciones as apiEstaciones, municipalidades as apiMunis } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos } from '../components/Estado.jsx';
import { Puede } from '../components/Puede.jsx';
import { MODULOS } from '../utils/constantes.js';

const VACIO = {
  codigo: '',
  nombre: '',
  municipalidadId: '',
  tipo: 'troncal',
  capacidadPersonas: 100,
  direccionReferencia: '',
};

/** RF-01: catalogo de estaciones. RF-13: asociacion a su municipalidad. */
export function Estaciones() {
  const [filtros, setFiltros] = useState({ texto: '', municipalidadId: '', estado: '' });
  const [formulario, setFormulario] = useState(null);
  const [errorForm, setErrorForm] = useState(null);

  const { datos, cargando, error, recargar } = useRecurso(
    () => apiEstaciones.listar({
      texto: filtros.texto || undefined,
      municipalidadId: filtros.municipalidadId || undefined,
      estado: filtros.estado || undefined,
      limite: 100,
    }),
    [filtros.texto, filtros.municipalidadId, filtros.estado],
  );

  const munis = useRecurso(() => apiMunis.listar(), []);

  async function guardar(evento) {
    evento.preventDefault();
    setErrorForm(null);
    try {
      await apiEstaciones.crear({
        ...formulario,
        municipalidadId: Number(formulario.municipalidadId),
        capacidadPersonas: Number(formulario.capacidadPersonas),
        direccionReferencia: formulario.direccionReferencia || undefined,
      });
      setFormulario(null);
      recargar();
    } catch (e) {
      setErrorForm(e);
    }
  }

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <h1>Estaciones</h1>
          <p>Catalogo de estaciones, su municipalidad y su inventario de accesos.</p>
        </div>
        <Puede modulo={MODULOS.LINEAS_ESTACIONES} nivel="E">
          <button
            type="button"
            className="boton boton--primario"
            onClick={() => setFormulario(formulario ? null : VACIO)}
          >
            {formulario ? 'Cancelar' : 'Nueva estacion'}
          </button>
        </Puede>
      </header>

      <div className="filtros">
        <label className="campo campo--linea">
          <span>Buscar</span>
          <input
            type="search"
            value={filtros.texto}
            placeholder="Codigo o nombre"
            onChange={(e) => setFiltros({ ...filtros, texto: e.target.value })}
          />
        </label>
        <label className="campo campo--linea">
          <span>Municipalidad</span>
          <select
            value={filtros.municipalidadId}
            onChange={(e) => setFiltros({ ...filtros, municipalidadId: e.target.value })}
          >
            <option value="">Todas</option>
            {munis.datos?.datos?.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </label>
        <label className="campo campo--linea">
          <span>Estado</span>
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="operativa">Operativa</option>
            <option value="mantenimiento">Mantenimiento</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </label>
      </div>

      {formulario && (
        <form className="panel formulario" onSubmit={guardar}>
          <h2>Nueva estacion</h2>
          <MensajeError error={errorForm} />
          <div className="rejilla-formulario">
            <label className="campo">
              <span>Codigo</span>
              <input
                value={formulario.codigo}
                onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value.toUpperCase() })}
                required
                maxLength={15}
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
              <span>Municipalidad (RF-13)</span>
              <select
                value={formulario.municipalidadId}
                onChange={(e) => setFormulario({ ...formulario, municipalidadId: e.target.value })}
                required
              >
                <option value="">Seleccione...</option>
                {munis.datos?.datos?.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Tipo</span>
              <select
                value={formulario.tipo}
                onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })}
              >
                <option value="troncal">Troncal</option>
                <option value="transferencia">Transferencia</option>
                <option value="terminal">Terminal</option>
                <option value="parada">Parada</option>
              </select>
            </label>
            <label className="campo">
              <span>Capacidad de personas</span>
              <input
                type="number"
                min={1}
                value={formulario.capacidadPersonas}
                onChange={(e) => setFormulario({ ...formulario, capacidadPersonas: e.target.value })}
                required
              />
            </label>
            <label className="campo campo--ancho">
              <span>Direccion de referencia</span>
              <input
                value={formulario.direccionReferencia}
                onChange={(e) => setFormulario({ ...formulario, direccionReferencia: e.target.value })}
                maxLength={250}
              />
            </label>
          </div>
          <button type="submit" className="boton boton--primario">Guardar estacion</button>
        </form>
      )}

      <article className="panel">
        {cargando && <Cargando />}
        <MensajeError error={error} onReintentar={recargar} />
        {datos?.items?.length === 0 && <SinDatos />}

        {datos?.items?.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Nombre</th>
                  <th>Municipalidad</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th className="num">Lineas</th>
                  <th className="num">Accesos</th>
                  <th className="num">Guardias req.</th>
                </tr>
              </thead>
              <tbody>
                {datos.items.map((e) => (
                  <tr key={e.id}>
                    <td><Link to={`/estaciones/${e.id}`}>{e.codigo}</Link></td>
                    <td>{e.nombre}</td>
                    <td>{e.municipalidad}</td>
                    <td>{e.tipo}</td>
                    <td>{e.estado}</td>
                    <td className="num">{e.total_lineas ?? 0}</td>
                    <td className="num">{e.total_accesos ?? 0}</td>
                    <td className="num">{e.guardias_requeridos ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {datos?.total > 0 && <p className="pie-tabla">{datos.total} estacion(es) en total.</p>}
      </article>
    </section>
  );
}
