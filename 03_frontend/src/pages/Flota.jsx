import { useState } from 'react';
import { useRecurso } from '../hooks/useRecurso.js';
import { buses as apiBuses, lineas as apiLineas, parqueos as apiParqueos } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';
import { Puede } from '../components/Puede.jsx';
import { MODULOS } from '../utils/constantes.js';

/**
 * RF-04: cada unidad se asigna a una sola linea activa. Si ya tiene una
 * asignacion vigente la API responde BUS_YA_ASIGNADO y aqui se ofrece
 * confirmar la reasignacion.
 * RF-06: asignacion de parqueo a la unidad.
 */
export function Flota() {
  const [filtros, setFiltros] = useState({ texto: '', estado: '', sinParqueo: false });
  const [dialogo, setDialogo] = useState(null); // { bus, tipo: 'linea' | 'parqueo' }
  const [errorAccion, setErrorAccion] = useState(null);

  const { datos, cargando, error, recargar } = useRecurso(
    () => apiBuses.listar({
      texto: filtros.texto || undefined,
      estado: filtros.estado || undefined,
      sinParqueo: filtros.sinParqueo || undefined,
      limite: 100,
    }),
    [filtros.texto, filtros.estado, filtros.sinParqueo],
  );

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <h1>Flota</h1>
          <p>Unidades, su linea vigente y su espacio de parqueo.</p>
        </div>
      </header>

      <div className="filtros">
        <label className="campo campo--linea">
          <span>Buscar</span>
          <input
            type="search"
            value={filtros.texto}
            placeholder="Placa o numero economico"
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
            <option value="operativo">Operativo</option>
            <option value="mantenimiento">Mantenimiento</option>
            <option value="fuera_servicio">Fuera de servicio</option>
            <option value="baja">Baja</option>
          </select>
        </label>
        <label className="campo campo--casilla">
          <input
            type="checkbox"
            checked={filtros.sinParqueo}
            onChange={(e) => setFiltros({ ...filtros, sinParqueo: e.target.checked })}
          />
          <span>Solo sin parqueo (RF-06)</span>
        </label>
      </div>

      <MensajeError error={errorAccion} />

      <article className="panel">
        {cargando && <Cargando />}
        <MensajeError error={error} onReintentar={recargar} />
        {datos?.items?.length === 0 && <SinDatos />}

        {datos?.items?.length > 0 && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Economico</th>
                  <th>Placa</th>
                  <th>Tipo</th>
                  <th className="num">Capacidad</th>
                  <th>Estado</th>
                  <th>Linea vigente</th>
                  <th>Parqueo</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {datos.items.map((b) => (
                  <tr key={b.id}>
                    <td>{b.numero_economico}</td>
                    <td>{b.placa}</td>
                    <td>{b.tipo}</td>
                    <td className="num">{b.capacidad_total}</td>
                    <td>{b.estado}</td>
                    <td>
                      {b.linea_codigo
                        ? <Etiqueta tono="ok">{b.linea_codigo}</Etiqueta>
                        : <Etiqueta tono="neutro">Sin asignar</Etiqueta>}
                    </td>
                    <td>
                      {b.espacio_codigo
                        ? `${b.predio} / ${b.espacio_codigo}`
                        : <Etiqueta tono="critico">Sin parqueo</Etiqueta>}
                    </td>
                    <td className="acciones-celda">
                      <Puede modulo={MODULOS.FLOTA} nivel="E">
                        <button
                          type="button"
                          className="boton boton--texto"
                          onClick={() => { setErrorAccion(null); setDialogo({ bus: b, tipo: 'linea' }); }}
                        >
                          Asignar linea
                        </button>
                        <button
                          type="button"
                          className="boton boton--texto"
                          onClick={() => { setErrorAccion(null); setDialogo({ bus: b, tipo: 'parqueo' }); }}
                        >
                          Parqueo
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

      {dialogo?.tipo === 'linea' && (
        <DialogoAsignarLinea
          bus={dialogo.bus}
          onCerrar={() => setDialogo(null)}
          onListo={() => { setDialogo(null); recargar(); }}
          onError={setErrorAccion}
        />
      )}

      {dialogo?.tipo === 'parqueo' && (
        <DialogoParqueo
          bus={dialogo.bus}
          onCerrar={() => setDialogo(null)}
          onListo={() => { setDialogo(null); recargar(); }}
          onError={setErrorAccion}
        />
      )}
    </section>
  );
}

/** RF-04: un bus, una sola linea activa. */
function DialogoAsignarLinea({ bus, onCerrar, onListo, onError }) {
  const [lineaId, setLineaId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [conflicto, setConflicto] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const catalogo = useRecurso(() => apiLineas.listar({ estado: 'activa', limite: 50 }), []);

  async function asignar(finalizarVigente) {
    setEnviando(true);
    try {
      await apiBuses.asignarLinea(bus.id, {
        lineaId: Number(lineaId),
        motivo: motivo || undefined,
        finalizarVigente,
      });
      onListo();
    } catch (e) {
      // La API distingue el caso "ya tiene asignacion vigente" (RF-04)
      if (e.codigo === 'BUS_YA_ASIGNADO') {
        setConflicto(e);
      } else {
        onError(e);
        onCerrar();
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Asignar linea">
      <div className="modal__panel">
        <h2>Asignar linea a {bus.numero_economico}</h2>

        {conflicto ? (
          <>
            <p className="aviso">{conflicto.mensaje}</p>
            <p>
              La unidad esta asignada a <strong>{conflicto.detalle?.lineaActual}</strong>. Para
              cumplir la regla de una sola linea activa, la asignacion anterior se cerrara con la
              fecha de hoy y quedara en el historial.
            </p>
            <div className="modal__acciones">
              <button type="button" className="boton boton--secundario" onClick={onCerrar}>
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--primario"
                disabled={enviando}
                onClick={() => asignar(true)}
              >
                Reasignar de todos modos
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); asignar(false); }}
          >
            <label className="campo">
              <span>Linea destino</span>
              <select value={lineaId} onChange={(e) => setLineaId(e.target.value)} required>
                <option value="">Seleccione...</option>
                {catalogo.datos?.items?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo} - {l.nombre} ({l.unidades_operativas}/{l.unidades_maximas})
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Motivo (opcional)</span>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={250} />
            </label>
            <div className="modal__acciones">
              <button type="button" className="boton boton--secundario" onClick={onCerrar}>
                Cancelar
              </button>
              <button type="submit" className="boton boton--primario" disabled={enviando}>
                Asignar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** RF-06: ninguna unidad operativa debe quedar sin parqueo. */
function DialogoParqueo({ bus, onCerrar, onListo, onError }) {
  const [predioId, setPredioId] = useState('');
  const [espacioId, setEspacioId] = useState('');
  const [enviando, setEnviando] = useState(false);

  const predios = useRecurso(() => apiParqueos.predios(), []);
  const espacios = useRecurso(
    () => (predioId
      ? apiParqueos.espacios(predioId, { soloDisponibles: true })
      : Promise.resolve({ datos: [] })),
    [predioId],
  );

  async function guardar(evento) {
    evento.preventDefault();
    setEnviando(true);
    try {
      await apiBuses.asignarParqueo(bus.id, {
        espacioId: Number(espacioId),
        liberarVigente: true,
      });
      onListo();
    } catch (e) {
      onError(e);
      onCerrar();
    } finally {
      setEnviando(false);
    }
  }

  async function liberar() {
    setEnviando(true);
    try {
      await apiBuses.liberarParqueo(bus.id);
      onListo();
    } catch (e) {
      onError(e);
      onCerrar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Asignar parqueo">
      <div className="modal__panel">
        <h2>Parqueo de {bus.numero_economico}</h2>
        {bus.espacio_codigo && (
          <p className="aviso">
            Actualmente ocupa {bus.predio} / {bus.espacio_codigo}.
          </p>
        )}

        <form onSubmit={guardar}>
          <label className="campo">
            <span>Predio</span>
            <select
              value={predioId}
              onChange={(e) => { setPredioId(e.target.value); setEspacioId(''); }}
              required
            >
              <option value="">Seleccione...</option>
              {predios.datos?.datos?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.espacios_libres} libres)
                </option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span>Espacio disponible</span>
            <select
              value={espacioId}
              onChange={(e) => setEspacioId(e.target.value)}
              required
              disabled={!predioId}
            >
              <option value="">Seleccione...</option>
              {espacios.datos?.datos?.map((es) => (
                <option key={es.id} value={es.id}>{es.codigo}</option>
              ))}
            </select>
          </label>

          <div className="modal__acciones">
            <button type="button" className="boton boton--secundario" onClick={onCerrar}>
              Cancelar
            </button>
            {bus.espacio_codigo && (
              <button
                type="button"
                className="boton boton--peligro"
                onClick={liberar}
                disabled={enviando}
              >
                Liberar espacio
              </button>
            )}
            <button type="submit" className="boton boton--primario" disabled={enviando}>
              Asignar espacio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
