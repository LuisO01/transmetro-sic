import { useEffect, useRef, useState } from 'react';
import { useRecurso } from '../hooks/useRecurso.js';
import { monitoreo, estaciones as apiEstaciones } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';
import { useAuth } from '../store/AuthContext.jsx';

/**
 * Monitoreo de capacidad y servicio (RF-09 y RF-10).
 * Es la pantalla del operador de estacion: ve el anden, registra la ocupacion
 * de cada unidad y la despacha. La regla de los cinco minutos se refleja aquí
 * con una cuenta regresiva, pero quien la hace cumplir es la base de datos.
 */
export function Monitoreo() {
  const { usuario } = useAuth();
  const [ahora, setAhora] = useState(Date.now());
  const [accion, setAccion] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [error, setError] = useState(null);

  // El operador tiene su estacion en la cuenta y el servidor la resuelve solo.
  // Los demas roles vigilan toda la red, de modo que deben elegir cual ven.
  const eligeEstacion = usuario?.ambito !== 'estacion';
  const [estacionId, setEstacionId] = useState('');

  const catalogo = useRecurso(
    () => (eligeEstacion ? apiEstaciones.listar({ estado: 'operativa' }) : Promise.resolve({ items: [] })),
    [eligeEstacion],
  );
  // El catalogo de estaciones responde paginado, en `items`
  const listaEstaciones = catalogo.datos?.items ?? [];

  // Sin estacion elegida no hay nada que consultar: el anden y las unidades
  // disponibles son siempre de una estacion concreta.
  const filtros = estacionId ? { estacionId: Number(estacionId) } : undefined;
  const listo = !eligeEstacion || Boolean(estacionId);
  const vacio = Promise.resolve({ datos: [] });

  const resumen = useRecurso(() => monitoreo.resumen(filtros), [estacionId]);
  const anden = useRecurso(() => (listo ? monitoreo.anden(filtros) : vacio), [estacionId, listo]);
  const disponibles = useRecurso(
    () => (listo ? monitoreo.unidadesDisponibles(filtros) : vacio),
    [estacionId, listo],
  );

  // La primera estacion del catalogo evita que la pantalla abra en blanco.
  useEffect(() => {
    if (eligeEstacion && !estacionId && listaEstaciones.length > 0) {
      setEstacionId(String(listaEstaciones[0].id));
    }
  }, [eligeEstacion, estacionId, listaEstaciones]);

  function refrescarTodo() {
    anden.recargar();
    resumen.recargar();
    disponibles.recargar();
  }

  // El refresco automatico se hace a traves de una referencia: asi los
  // temporizadores se crean una sola vez, pero siempre recargan con la
  // estacion elegida en ese momento y no con la del primer render.
  const refrescar = useRef(() => {});
  refrescar.current = () => { anden.recargar(); resumen.recargar(); };

  // El anden es información que cambia sola: se refresca cada 15 segundos y el
  // reloj avanza cada segundo para la cuenta regresiva de la regla RF-10.
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const refresco = setInterval(() => refrescar.current(), 15000);
    return () => { clearInterval(reloj); clearInterval(refresco); };
  }, []);

  async function ejecutar(fn, mensajeOk) {
    setError(null);
    setAviso(null);
    try {
      await fn();
      setAviso(mensajeOk);
      refrescarTodo();
    } catch (e) {
      setError(e);
    }
  }

  const unidades = anden.datos?.datos ?? [];
  const r = resumen.datos?.datos;

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <h1>Monitoreo de capacidad y servicio</h1>
          <p>
            {eligeEstacion
              ? 'Elija la estación que desea vigilar · el andén se actualiza solo cada 15 segundos'
              : `Estación ${usuario?.estacion ?? 'sin asignar'} · el andén se actualiza solo cada 15 segundos`}
          </p>
        </div>
        <button type="button" className="boton boton--secundario" onClick={refrescarTodo}>
          Actualizar ahora
        </button>
      </header>

      {eligeEstacion && (
        <div className="filtros">
          <label className="campo campo--linea">
            <span>Estación</span>
            <select value={estacionId} onChange={(e) => setEstacionId(e.target.value)}>
              <option value="">Seleccione...</option>
              {listaEstaciones.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} · {e.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {r && (
        <div className="rejilla-4">
          <Indicador titulo="Unidades en andén" valor={r.en_anden} />
          <Indicador titulo="Viajes de hoy" valor={r.viajes_hoy} />
          <Indicador titulo="Mediciones de hoy" valor={r.mediciones_hoy} />
          <Indicador
            titulo="Sobrecupos de hoy"
            valor={r.sobrecupos_hoy}
            tono={r.sobrecupos_hoy > 0 ? 'critico' : 'ok'}
            pie={`Ocupación promedio ${r.ocupacion_promedio} %`}
          />
        </div>
      )}

      {aviso && <div className="estado estado--ok" role="status">{aviso}</div>}
      <MensajeError error={error} />

      <article className="panel">
        <header className="panel__cabecera">
          <h2>Andén</h2>
          <button
            type="button"
            className="boton boton--primario"
            disabled={!listo}
            title={listo ? undefined : 'Elija primero la estación'}
            onClick={() => setAccion({ tipo: 'llegada' })}
          >
            Registrar llegada
          </button>
        </header>

        {anden.cargando && <Cargando />}
        <MensajeError error={anden.error} onReintentar={anden.recargar} />
        {!anden.cargando && unidades.length === 0 && (
          <SinDatos
            texto={listo
              ? 'No hay unidades en el andén. Registre una llegada para comenzar.'
              : 'Elija una estación para ver su andén.'}
          />
        )}

        <div className="rejilla-andenes">
          {unidades.map((u) => {
            const segundos = Math.max(0, 300 - Math.floor((ahora - new Date(u.fecha_hora_llegada)) / 1000));
            const ocupacion = u.porcentaje_ocupacion == null ? null : Number(u.porcentaje_ocupacion);
            const retenido = ocupacion !== null && ocupacion < 25 && segundos > 0;

            return (
              <div className={`tarjeta-unidad${u.sobrecupo ? ' tarjeta-unidad--alerta' : ''}`} key={u.id}>
                <header>
                  <strong>{u.numero_economico}</strong>
                  <span className="chip-linea" style={{ background: u.color_hex }}>{u.linea_codigo}</span>
                </header>
                <p className="tarjeta-unidad__dato">
                  {u.placa} · {u.sentido} · capacidad {u.capacidad_total}
                </p>

                {ocupacion === null ? (
                  <p className="tarjeta-unidad__pendiente">Sin medición de ocupación</p>
                ) : (
                  <>
                    <div className="barra" aria-hidden="true">
                      <div
                        className={`barra__relleno${u.sobrecupo ? ' barra__relleno--alerta' : ''}`}
                        style={{ width: `${Math.min(ocupacion, 150) / 1.5}%` }}
                      />
                    </div>
                    <p className="tarjeta-unidad__dato">
                      {u.pasajeros_abordo} pasajeros · <strong>{ocupacion.toFixed(1)} %</strong>
                      {u.sobrecupo && <Etiqueta tono="critico">Sobrecupo</Etiqueta>}
                    </p>
                  </>
                )}

                {retenido && (
                  <p className="tarjeta-unidad__regla">
                    Retenida por la regla de 5 minutos (RF-10): faltan{' '}
                    <strong>{Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}</strong>
                  </p>
                )}

                <div className="tarjeta-unidad__acciones">
                  <button
                    type="button"
                    className="boton boton--secundario"
                    onClick={() => setAccion({ tipo: 'ocupacion', unidad: u })}
                  >
                    Registrar ocupación
                  </button>
                  <button
                    type="button"
                    className="boton boton--primario"
                    disabled={retenido}
                    title={retenido ? 'La regla de 5 minutos impide el despacho' : undefined}
                    onClick={() => ejecutar(
                      () => monitoreo.despachar(u.id),
                      `Unidad ${u.numero_economico} despachada.`,
                    )}
                  >
                    Despachar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </article>

      {accion?.tipo === 'llegada' && (
        <DialogoLlegada
          unidades={disponibles.datos?.datos ?? []}
          onCerrar={() => setAccion(null)}
          onConfirmar={(datos) => {
            setAccion(null);
            ejecutar(
              () => monitoreo.registrarLlegada({ ...datos, ...filtros }),
              'Llegada registrada en el andén.',
            );
          }}
        />
      )}

      {accion?.tipo === 'ocupacion' && (
        <DialogoOcupacion
          unidad={accion.unidad}
          onCerrar={() => setAccion(null)}
          onConfirmar={(pasajeros) => {
            setAccion(null);
            ejecutar(
              // Los identificadores vienen como texto porque son bigint
              () => monitoreo.registrarOcupacion({
                busId: Number(accion.unidad.bus_id),
                viajeId: Number(accion.unidad.id),
                pasajerosAbordo: pasajeros,
                ...filtros,
              }),
              'Ocupación registrada.',
            );
          }}
        />
      )}
    </section>
  );
}

function Indicador({ titulo, valor, pie, tono }) {
  return (
    <div className={`indicador${tono ? ` indicador--${tono}` : ''}`}>
      <small>{titulo}</small>
      <strong>{valor}</strong>
      {pie && <span>{pie}</span>}
    </div>
  );
}

function DialogoLlegada({ unidades, onCerrar, onConfirmar }) {
  const [busId, setBusId] = useState('');
  const [sentido, setSentido] = useState('ida');

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Registrar llegada">
      <div className="modal__panel">
        <h2>Registrar llegada al andén</h2>
        <form onSubmit={(e) => { e.preventDefault(); onConfirmar({ busId: Number(busId), sentido }); }}>
          <label className="campo">
            <span>Unidad</span>
            <select value={busId} onChange={(e) => setBusId(e.target.value)} required>
              <option value="">Seleccione...</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.numero_economico} · {u.linea_codigo} · capacidad {u.capacidad_total}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Sentido</span>
            <select value={sentido} onChange={(e) => setSentido(e.target.value)}>
              <option value="ida">Ida</option>
              <option value="vuelta">Vuelta</option>
            </select>
          </label>
          <div className="modal__acciones">
            <button type="button" className="boton boton--secundario" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="boton boton--primario">Registrar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogoOcupacion({ unidad, onCerrar, onConfirmar }) {
  const [pasajeros, setPasajeros] = useState(unidad.pasajeros_abordo ?? '');
  const capacidad = unidad.capacidad_total;
  const valor = Number(pasajeros) || 0;
  const porcentaje = capacidad ? (valor * 100) / capacidad : 0;

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Registrar ocupación">
      <div className="modal__panel">
        <h2>Ocupación de {unidad.numero_economico}</h2>
        <p className="nota">Capacidad nominal: {capacidad} pasajeros.</p>
        <form onSubmit={(e) => { e.preventDefault(); onConfirmar(valor); }}>
          <label className="campo">
            <span>Pasajeros a bordo</span>
            <input
              type="number"
              min={0}
              max={500}
              value={pasajeros}
              onChange={(e) => setPasajeros(e.target.value)}
              required
              autoFocus
            />
          </label>

          <div className="barra" aria-hidden="true">
            <div
              className={`barra__relleno${porcentaje > 150 ? ' barra__relleno--alerta' : ''}`}
              style={{ width: `${Math.min(porcentaje, 150) / 1.5}%` }}
            />
          </div>
          <p className="nota">
            {porcentaje.toFixed(1)} % de ocupación
            {porcentaje > 150 && ' · supera el 150 %, generará alerta de sobrecupo (RF-09)'}
            {porcentaje < 25 && ' · bajo el 25 %, aplicará la espera de 5 minutos (RF-10)'}
          </p>

          <div className="modal__acciones">
            <button type="button" className="boton boton--secundario" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="boton boton--primario">Guardar medición</button>
          </div>
        </form>
      </div>
    </div>
  );
}
