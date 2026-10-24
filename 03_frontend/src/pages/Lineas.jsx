import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecurso } from '../hooks/useRecurso.js';
import { lineas as apiLineas, municipalidades as apiMunis } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';
import { Puede } from '../components/Puede.jsx';
import { MODULOS, SITUACION_LINEA } from '../utils/constantes.js';

const VACIO = {
  codigo: '',
  nombre: '',
  colorHex: '#0057B8',
  tipo: 'troncal',
  municipalidadId: '',
  unidadesMinimas: 10,
  unidadesMaximas: 20,
  estado: 'planificada',
};

/** RF-01: catalogo de lineas. RF-05: rango minimo y maximo de unidades. */
export function Lineas() {
  const [filtros, setFiltros] = useState({ estado: '', texto: '' });
  const [formulario, setFormulario] = useState(null);
  const [errorForm, setErrorForm] = useState(null);

  const { datos, cargando, error, recargar } = useRecurso(
    () => apiLineas.listar({ estado: filtros.estado || undefined, texto: filtros.texto || undefined }),
    [filtros.estado, filtros.texto],
  );

  const munis = useRecurso(() => apiMunis.listar(), []);

  async function guardar(evento) {
    evento.preventDefault();
    setErrorForm(null);
    try {
      await apiLineas.crear({
        ...formulario,
        municipalidadId: Number(formulario.municipalidadId),
        unidadesMinimas: Number(formulario.unidadesMinimas),
        unidadesMaximas: Number(formulario.unidadesMaximas),
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
          <h1>Lineas</h1>
          <p>Catalogo de lineas, rango de unidades y longitud del recorrido.</p>
        </div>
        <Puede modulo={MODULOS.LINEAS_ESTACIONES} nivel="E">
          <button
            type="button"
            className="boton boton--primario"
            onClick={() => setFormulario(formulario ? null : VACIO)}
          >
            {formulario ? 'Cancelar' : 'Nueva linea'}
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
          <span>Estado</span>
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="activa">Activa</option>
            <option value="planificada">Planificada</option>
            <option value="suspendida">Suspendida</option>
            <option value="baja">Baja</option>
          </select>
        </label>
      </div>

      {formulario && (
        <form className="panel formulario" onSubmit={guardar}>
          <h2>Nueva linea</h2>
          <MensajeError error={errorForm} />

          <div className="rejilla-formulario">
            <label className="campo">
              <span>Codigo</span>
              <input
                value={formulario.codigo}
                onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value.toUpperCase() })}
                required
                maxLength={10}
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
              <span>Municipalidad</span>
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
                <option value="alimentadora">Alimentadora</option>
                <option value="expres">Expres</option>
              </select>
            </label>
            <label className="campo">
              <span>Unidades minimas (RF-05)</span>
              <input
                type="number"
                min={1}
                value={formulario.unidadesMinimas}
                onChange={(e) => setFormulario({ ...formulario, unidadesMinimas: e.target.value })}
                required
              />
            </label>
            <label className="campo">
              <span>Unidades maximas (RF-05)</span>
              <input
                type="number"
                min={1}
                value={formulario.unidadesMaximas}
                onChange={(e) => setFormulario({ ...formulario, unidadesMaximas: e.target.value })}
                required
              />
            </label>
            <label className="campo">
              <span>Color</span>
              <input
                type="color"
                value={formulario.colorHex}
                onChange={(e) => setFormulario({ ...formulario, colorHex: e.target.value })}
              />
            </label>
          </div>

          <button type="submit" className="boton boton--primario">Guardar linea</button>
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
                  <th>Estado</th>
                  <th className="num">Estaciones</th>
                  <th className="num">Longitud (km)</th>
                  <th className="num">Unidades</th>
                  <th>Situacion</th>
                </tr>
              </thead>
              <tbody>
                {datos.items.map((l) => {
                  const s = SITUACION_LINEA[l.situacion] ?? SITUACION_LINEA.sin_evaluar;
                  return (
                    <tr key={l.id}>
                      <td>
                        <span className="punto" style={{ background: l.color_hex }} aria-hidden="true" />
                        <Link to={`/lineas/${l.id}`}>{l.codigo}</Link>
                      </td>
                      <td>{l.nombre}</td>
                      <td>{l.municipalidad}</td>
                      <td>{l.estado}</td>
                      <td className="num">{l.total_estaciones}</td>
                      <td className="num">{Number(l.longitud_km_ida ?? 0).toFixed(2)}</td>
                      <td className="num">
                        {l.unidades_operativas} / {l.unidades_minimas}-{l.unidades_maximas}
                      </td>
                      <td><Etiqueta tono={s.tono}>{s.texto}</Etiqueta></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
