import { useState } from 'react';
import { useRecurso } from '../hooks/useRecurso.js';
import { alertas as apiAlertas } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';
import { Puede } from '../components/Puede.jsx';
import { MODULOS, ETIQUETA_ALERTA } from '../utils/constantes.js';

/**
 * Bandeja de alertas generadas automaticamente por las reglas de la base:
 * RF-05 rango de unidades, RF-06 bus sin parqueo, RF-08 cobertura de guardias,
 * RF-09 sobrecupo.
 */
export function Alertas() {
  const [filtros, setFiltros] = useState({ tipo: '', severidad: '' });
  const [errorAccion, setErrorAccion] = useState(null);

  const { datos, cargando, error, recargar } = useRecurso(
    () => apiAlertas.listar({
      tipo: filtros.tipo || undefined,
      severidad: filtros.severidad || undefined,
      limite: 100,
    }),
    [filtros.tipo, filtros.severidad],
  );

  const resumen = useRecurso(() => apiAlertas.resumen(), []);

  async function atender(id, estado) {
    setErrorAccion(null);
    try {
      await apiAlertas.atender(id, { estado });
      recargar();
      resumen.recargar();
    } catch (e) {
      setErrorAccion(e);
    }
  }

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <h1>Alertas</h1>
          <p>Excepciones detectadas automaticamente por las reglas de negocio.</p>
        </div>
      </header>

      {resumen.datos?.datos?.length > 0 && (
        <div className="rejilla-3">
          {resumen.datos.datos.map((r) => (
            <div className="indicador" key={`${r.tipo}-${r.severidad}`}>
              <small>{ETIQUETA_ALERTA[r.tipo] ?? r.tipo}</small>
              <strong>{r.total}</strong>
              <Etiqueta tono={r.severidad === 'critica' ? 'critico' : 'aviso'}>{r.severidad}</Etiqueta>
            </div>
          ))}
        </div>
      )}

      <div className="filtros">
        <label className="campo campo--linea">
          <span>Tipo</span>
          <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(ETIQUETA_ALERTA).map(([clave, texto]) => (
              <option key={clave} value={clave}>{texto}</option>
            ))}
          </select>
        </label>
        <label className="campo campo--linea">
          <span>Severidad</span>
          <select
            value={filtros.severidad}
            onChange={(e) => setFiltros({ ...filtros, severidad: e.target.value })}
          >
            <option value="">Todas</option>
            <option value="critica">Critica</option>
            <option value="advertencia">Advertencia</option>
            <option value="info">Informativa</option>
          </select>
        </label>
      </div>

      <MensajeError error={errorAccion} />

      <article className="panel">
        {cargando && <Cargando />}
        <MensajeError error={error} onReintentar={recargar} />
        {datos?.datos?.length === 0 && <SinDatos texto="No hay alertas abiertas." />}

        {datos?.datos?.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Severidad</th>
                  <th>Mensaje</th>
                  <th>Linea</th>
                  <th>Estacion</th>
                  <th>Generada</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {datos.datos.map((a) => (
                  <tr key={a.id}>
                    <td>{ETIQUETA_ALERTA[a.tipo] ?? a.tipo}</td>
                    <td>
                      <Etiqueta tono={a.severidad === 'critica' ? 'critico' : 'aviso'}>
                        {a.severidad}
                      </Etiqueta>
                    </td>
                    <td>{a.mensaje}</td>
                    <td>{a.linea_codigo ?? '-'}</td>
                    <td>{a.estacion_codigo ?? '-'}</td>
                    <td>{new Date(a.generada_en).toLocaleString('es-GT')}</td>
                    <td className="acciones-celda">
                      <Puede modulo={MODULOS.MONITOREO} nivel="E">
                        {a.estado === 'abierta' && (
                          <button
                            type="button"
                            className="boton boton--texto"
                            onClick={() => atender(a.id, 'en_revision')}
                          >
                            Tomar
                          </button>
                        )}
                        <button
                          type="button"
                          className="boton boton--texto"
                          onClick={() => atender(a.id, 'cerrada')}
                        >
                          Cerrar
                        </button>
                      </Puede>
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
