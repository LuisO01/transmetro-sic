import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';
import { useRecurso } from '../hooks/useRecurso.js';
import { tablero, alertas as apiAlertas, parqueos as apiParqueos } from '../api/endpoints.js';
import { Cargando, MensajeError, SinDatos, Etiqueta } from '../components/Estado.jsx';
import { MapaRed } from '../components/MapaRed.jsx';
import { GraficaUnidadesPorLinea, GraficaAlertas, GraficaOcupacion } from '../components/Graficas.jsx';
import { MODULOS, ETIQUETA_ALERTA } from '../utils/constantes.js';

/** Tablero principal: mapa de la red, indicadores y graficas. */
export function Tablero() {
  const { usuario, puede } = useAuth();
  const navegar = useNavigate();

  const verFlota = puede(MODULOS.FLOTA, 'L');
  const verMonitoreo = puede(MODULOS.MONITOREO, 'L');

  const mapa = useRecurso(() => tablero.mapa(), []);
  const indicadores = useRecurso(() => tablero.indicadores(), []);
  const bandeja = useRecurso(
    () => (verMonitoreo ? apiAlertas.listar({ limite: 6 }) : Promise.resolve({ datos: [] })),
    [verMonitoreo],
  );
  const sinParqueo = useRecurso(
    () => (verFlota ? apiParqueos.sinParqueo() : Promise.resolve({ datos: [] })),
    [verFlota],
  );

  const t = indicadores.datos?.datos?.totales;
  const porLinea = indicadores.datos?.datos?.porLinea ?? [];
  const alertasPorTipo = indicadores.datos?.datos?.alertas ?? [];
  const ocupacion = indicadores.datos?.datos?.ocupacion ?? [];
  const lineasMapa = mapa.datos?.datos ?? [];

  return (
    <section>
      <header className="pagina__cabecera">
        <div>
          <h1>Tablero</h1>
          <p>
            {usuario?.nombreCompleto} · ámbito de datos <strong>{usuario?.ambito}</strong>
          </p>
        </div>
      </header>

      {indicadores.cargando && <Cargando />}
      <MensajeError error={indicadores.error} onReintentar={indicadores.recargar} />

      {t && (
        <div className="rejilla-kpi">
          <Kpi titulo="Líneas activas" valor={t.lineas_activas} pie={`${t.km_red} km de red`} />
          <Kpi titulo="Estaciones operativas" valor={t.estaciones_operativas} />
          <Kpi titulo="Unidades operativas" valor={t.unidades_operativas} pie={`${t.unidades_taller} en taller`} />
          <Kpi
            titulo="Unidades sin parqueo"
            valor={t.sin_parqueo}
            tono={t.sin_parqueo > 0 ? 'critico' : 'ok'}
            pie="RF-06"
          />
          <Kpi
            titulo="Alertas abiertas"
            valor={t.alertas_abiertas}
            tono={t.alertas_abiertas > 0 ? 'aviso' : 'ok'}
          />
        </div>
      )}

      <article className="panel">
        <header className="panel__cabecera">
          <h2>Mapa de la red</h2>
          <p className="nota">
            Trazado con las coordenadas de cada estación. Pase el cursor sobre una línea para resaltarla.
          </p>
        </header>
        {mapa.cargando && <Cargando />}
        <MensajeError error={mapa.error} onReintentar={mapa.recargar} />
        {lineasMapa.length > 0 && (
          <MapaRed
            lineas={lineasMapa}
            onSeleccionEstacion={(e) => navegar(`/estaciones/${e.id}`)}
          />
        )}
      </article>

      <div className="rejilla-2">
        <article className="panel">
          <h2>Unidades por línea (RF-05)</h2>
          <GraficaUnidadesPorLinea datos={porLinea} />
        </article>

        <article className="panel">
          <h2>Alertas abiertas por tipo</h2>
          {alertasPorTipo.length === 0
            ? <SinDatos texto="No hay alertas abiertas." />
            : <GraficaAlertas datos={alertasPorTipo} etiquetas={ETIQUETA_ALERTA} />}
        </article>
      </div>

      {verMonitoreo && (
        <article className="panel">
          <h2>Ocupación promedio por hora (RF-09)</h2>
          <GraficaOcupacion datos={ocupacion} />
        </article>
      )}

      <div className="rejilla-2">
        {verMonitoreo && (
          <article className="panel">
            <h2>Últimas alertas</h2>
            {bandeja.cargando && <Cargando />}
            {bandeja.datos?.datos?.length === 0 && <SinDatos texto="Sin alertas abiertas." />}
            <ul className="lista-alertas">
              {bandeja.datos?.datos?.map((a) => (
                <li key={a.id}>
                  <Etiqueta tono={a.severidad === 'critica' ? 'critico' : 'aviso'}>
                    {ETIQUETA_ALERTA[a.tipo] ?? a.tipo}
                  </Etiqueta>
                  <p>{a.mensaje}</p>
                  <small>{new Date(a.generada_en).toLocaleString('es-GT')}</small>
                </li>
              ))}
            </ul>
          </article>
        )}

        {verFlota && (
          <article className="panel">
            <h2>Unidades sin parqueo (RF-06)</h2>
            {sinParqueo.cargando && <Cargando />}
            {sinParqueo.datos?.datos?.length === 0 && (
              <SinDatos texto="Todas las unidades operativas tienen parqueo asignado." />
            )}
            <ul className="lista-simple">
              {sinParqueo.datos?.datos?.map((b) => (
                <li key={b.bus_id}>
                  <strong>{b.numero_economico}</strong> ({b.placa}) · {b.linea_codigo ?? 'sin línea'}
                </li>
              ))}
            </ul>
          </article>
        )}
      </div>
    </section>
  );
}

function Kpi({ titulo, valor, pie, tono }) {
  return (
    <div className={`kpi${tono ? ` kpi--${tono}` : ''}`}>
      <small>{titulo}</small>
      <strong>{valor}</strong>
      {pie && <span>{pie}</span>}
    </div>
  );
}
