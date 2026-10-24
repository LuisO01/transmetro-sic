import { useMemo, useState } from 'react';

/**
 * Mapa de la red dibujado en SVG a partir de las coordenadas de las estaciones.
 * No usa servicios externos de mapas: el sistema debe funcionar en estaciones
 * con conectividad intermitente, y un mapa que depende de internet deja de ser
 * util justo cuando mas se necesita.
 *
 * La proyeccion es la mas simple posible (equirectangular), con una correccion
 * por latitud para que las distancias horizontales no se vean estiradas.
 */
export function MapaRed({ lineas, onSeleccionEstacion }) {
  const [resaltada, setResaltada] = useState(null);
  const [activa, setActiva] = useState(null);

  const ANCHO = 900;
  const ALTO = 560;
  const MARGEN = 48;

  const { puntos, limites } = useMemo(() => {
    const todas = lineas.flatMap((l) => l.estaciones.map((e) => ({ ...e, linea: l })));
    if (todas.length === 0) return { puntos: [], limites: null };

    const lats = todas.map((e) => e.latitud);
    const lons = todas.map((e) => e.longitud);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    // A la latitud de Guatemala un grado de longitud mide menos que uno de
    // latitud; el coseno corrige esa diferencia.
    const factor = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const anchoGeo = (maxLon - minLon) * factor || 1;
    const altoGeo = (maxLat - minLat) || 1;
    const escala = Math.min((ANCHO - MARGEN * 2) / anchoGeo, (ALTO - MARGEN * 2) / altoGeo);

    const desplazeX = (ANCHO - anchoGeo * escala) / 2;
    const desplazeY = (ALTO - altoGeo * escala) / 2;

    return {
      limites: { minLat, maxLat, minLon, maxLon },
      puntos: todas.map((e) => ({
        ...e,
        x: desplazeX + (e.longitud - minLon) * factor * escala,
        // La latitud crece hacia el norte y la pantalla hacia abajo
        y: desplazeY + (maxLat - e.latitud) * escala,
      })),
    };
  }, [lineas]);

  if (!limites) {
    return <p className="estado estado--vacio">No hay estaciones con coordenadas para dibujar el mapa.</p>;
  }

  const porEstacion = new Map();
  for (const p of puntos) {
    const existente = porEstacion.get(p.codigo);
    if (existente) existente.lineas.push(p.linea);
    else porEstacion.set(p.codigo, { ...p, lineas: [p.linea] });
  }
  const estacionesUnicas = [...porEstacion.values()];

  const trazos = lineas.map((l) => ({
    linea: l,
    d: puntos
      .filter((p) => p.linea.codigo === l.codigo)
      .sort((a, b) => a.orden_recorrido - b.orden_recorrido)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' '),
  }));

  return (
    <div className="mapa">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Mapa de la red del Transmetro">
        <rect width={ANCHO} height={ALTO} className="mapa__fondo" />

        {/* Rejilla de referencia, para dar sensacion de plano sin fingir un mapa real */}
        {Array.from({ length: 10 }, (_, i) => (
          <g key={`g${i}`}>
            <line x1={(ANCHO / 10) * i} y1="0" x2={(ANCHO / 10) * i} y2={ALTO} className="mapa__rejilla" />
            <line x1="0" y1={(ALTO / 10) * i} x2={ANCHO} y2={(ALTO / 10) * i} className="mapa__rejilla" />
          </g>
        ))}

        {trazos.map(({ linea, d }) => (
          <path
            key={linea.codigo}
            d={d}
            fill="none"
            stroke={linea.color_hex}
            strokeWidth={resaltada && resaltada !== linea.codigo ? 3 : 7}
            strokeOpacity={resaltada && resaltada !== linea.codigo ? 0.25 : 0.85}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {estacionesUnicas.map((e) => {
          const esTerminal = e.tipo === 'terminal';
          const esTransferencia = e.tipo === 'transferencia' || e.lineas.length > 1;
          const atenuada = resaltada && !e.lineas.some((l) => l.codigo === resaltada);
          const radio = esTerminal ? 9 : esTransferencia ? 7 : 5;

          return (
            <g
              key={e.codigo}
              className="mapa__estacion"
              opacity={atenuada ? 0.3 : 1}
              onMouseEnter={() => setActiva(e)}
              onMouseLeave={() => setActiva(null)}
              onClick={() => onSeleccionEstacion?.(e)}
            >
              <circle cx={e.x} cy={e.y} r={radio + 3} fill="#fff" />
              <circle
                cx={e.x}
                cy={e.y}
                r={radio}
                fill={esTransferencia ? '#fff' : e.lineas[0].color_hex}
                stroke={e.lineas[0].color_hex}
                strokeWidth={esTransferencia ? 3.5 : 2}
              />
              {(esTerminal || esTransferencia) && (
                <text x={e.x + radio + 5} y={e.y + 4} className="mapa__etiqueta">{e.nombre}</text>
              )}
            </g>
          );
        })}

        {activa && (
          <g className="mapa__tooltip" pointerEvents="none">
            <rect
              x={Math.min(activa.x + 12, ANCHO - 230)}
              y={Math.max(activa.y - 56, 6)}
              width="222"
              height="52"
              rx="6"
            />
            <text x={Math.min(activa.x + 22, ANCHO - 220)} y={Math.max(activa.y - 36, 26)}>
              {activa.nombre}
            </text>
            <text
              x={Math.min(activa.x + 22, ANCHO - 220)}
              y={Math.max(activa.y - 18, 44)}
              className="mapa__tooltip-dato"
            >
              {activa.tipo} · {activa.accesos} accesos · {activa.lineas.map((l) => l.codigo).join(', ')}
            </text>
          </g>
        )}
      </svg>

      <div className="mapa__leyenda">
        {lineas.map((l) => (
          <button
            key={l.codigo}
            type="button"
            className={`mapa__leyenda-item${resaltada === l.codigo ? ' activo' : ''}`}
            onMouseEnter={() => setResaltada(l.codigo)}
            onMouseLeave={() => setResaltada(null)}
            onClick={() => setResaltada(resaltada === l.codigo ? null : l.codigo)}
          >
            <span className="mapa__color" style={{ background: l.color_hex }} />
            <span>
              <strong>{l.codigo}</strong> {l.nombre.split(' - ')[0]}
              <small>
                {Number(l.longitud_km).toFixed(1)} km · {l.unidades_operativas} unidades · Q{Number(l.tarifa).toFixed(2)}
              </small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
