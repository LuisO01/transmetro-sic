/**
 * Graficas en SVG, sin librerias externas.
 *
 * Son pocas y simples a proposito: una barra por linea y una dona por tipo de
 * alerta. Una libreria de graficas pesaria mas que todo el frontend junto y
 * aqui no se necesita nada que estas no hagan.
 */

/**
 * Unidades por linea frente a su rango permitido. La banda gris marca el rango
 * y la barra la cantidad real, de modo que se ve de un vistazo cual linea esta
 * fuera de lo autorizado (RF-05).
 */
export function GraficaUnidadesPorLinea({ datos }) {
  if (!datos?.length) return null;

  const ANCHO = 640;
  const ALTO_FILA = 34;
  const ALTO = datos.length * ALTO_FILA + 28;
  const IZQ = 46;
  const DER = 54;
  const maximo = Math.max(...datos.map((d) => Math.max(d.unidades, d.unidades_maximas))) * 1.1;
  const escala = (v) => ((ANCHO - IZQ - DER) * v) / maximo;

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="grafica" role="img"
         aria-label="Unidades operativas por linea frente a su rango permitido">
      {datos.map((d, i) => {
        const y = i * ALTO_FILA + 12;
        const fueraDeRango = d.situacion !== 'en_rango';
        return (
          <g key={d.codigo}>
            <text x="0" y={y + 14} className="grafica__etiqueta">{d.codigo}</text>

            {/* Rango autorizado */}
            <rect
              x={IZQ + escala(d.unidades_minimas)}
              y={y + 2}
              width={Math.max(escala(d.unidades_maximas - d.unidades_minimas), 2)}
              height={ALTO_FILA - 14}
              className="grafica__rango"
            />

            {/* Unidades reales */}
            <rect
              x={IZQ}
              y={y + 5}
              width={Math.max(escala(d.unidades), 2)}
              height={ALTO_FILA - 20}
              fill={d.color_hex}
              opacity={fueraDeRango ? 0.55 : 1}
              rx="3"
            />

            <text
              x={IZQ + escala(d.unidades) + 7}
              y={y + 15}
              className={`grafica__valor${fueraDeRango ? ' grafica__valor--alerta' : ''}`}
            >
              {d.unidades}
              {fueraDeRango && ' !'}
            </text>
          </g>
        );
      })}
      <text x={IZQ} y={ALTO - 4} className="grafica__pie">
        La banda gris es el rango autorizado de cada linea
      </text>
    </svg>
  );
}

/** Alertas abiertas por tipo. */
export function GraficaAlertas({ datos, etiquetas = {} }) {
  if (!datos?.length) return null;

  const total = datos.reduce((s, d) => s + d.total, 0);
  const COLORES = {
    critica: 'var(--rojo)',
    advertencia: 'var(--ambar)',
    info: 'var(--azul)',
  };

  const R = 62;
  const CIRCUNFERENCIA = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div className="dona">
      <svg viewBox="0 0 170 170" role="img" aria-label="Alertas abiertas por tipo">
        <g transform="translate(85,85) rotate(-90)">
          {datos.map((d) => {
            const porcion = (d.total / total) * CIRCUNFERENCIA;
            const trazo = (
              <circle
                key={`${d.tipo}-${d.severidad}`}
                r={R}
                fill="none"
                stroke={COLORES[d.severidad] ?? 'var(--gris-400)'}
                strokeWidth="22"
                strokeDasharray={`${porcion} ${CIRCUNFERENCIA - porcion}`}
                strokeDashoffset={-acumulado}
              />
            );
            acumulado += porcion;
            return trazo;
          })}
        </g>
        <text x="85" y="80" textAnchor="middle" className="dona__total">{total}</text>
        <text x="85" y="98" textAnchor="middle" className="dona__rotulo">abiertas</text>
      </svg>

      <ul className="dona__leyenda">
        {datos.map((d) => (
          <li key={`${d.tipo}-${d.severidad}`}>
            <span className="dona__punto" style={{ background: COLORES[d.severidad] ?? 'var(--gris-400)' }} />
            <span>
              {etiquetas[d.tipo] ?? d.tipo}
              <small>{d.total} · {d.severidad}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ocupacion promedio por hora, de las ultimas 24 horas. */
export function GraficaOcupacion({ datos }) {
  if (!datos?.length) {
    return (
      <p className="estado estado--vacio">
        Aun no hay mediciones de ocupacion en las ultimas 24 horas.
      </p>
    );
  }

  const ANCHO = 640;
  const ALTO = 190;
  const BASE = ALTO - 34;
  const TOPE = 18;
  const ancho = (ANCHO - 44) / datos.length;
  const escala = (v) => BASE - ((BASE - TOPE) * Math.min(v, 200)) / 200;

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="grafica" role="img"
         aria-label="Ocupacion promedio por hora en las ultimas 24 horas">
      {[0, 50, 100, 150, 200].map((v) => (
        <g key={v}>
          <line x1="38" y1={escala(v)} x2={ANCHO} y2={escala(v)} className="grafica__guia" />
          <text x="0" y={escala(v) + 4} className="grafica__etiqueta">{v}%</text>
        </g>
      ))}

      {/* Umbral de sobrecupo del 150 % (RF-09) */}
      <line x1="38" y1={escala(150)} x2={ANCHO} y2={escala(150)} className="grafica__umbral" />
      <text x={ANCHO - 4} y={escala(150) - 5} textAnchor="end" className="grafica__umbral-texto">
        sobrecupo 150 %
      </text>

      {datos.map((d, i) => {
        const x = 40 + i * ancho;
        const alto = BASE - escala(d.promedio);
        return (
          <g key={d.hora}>
            <rect
              x={x}
              y={escala(d.promedio)}
              width={Math.max(ancho - 6, 4)}
              height={Math.max(alto, 1)}
              rx="3"
              fill={d.sobrecupos > 0 ? 'var(--rojo)' : 'var(--azul)'}
              opacity="0.85"
            />
            <text x={x + (ancho - 6) / 2} y={BASE + 14} textAnchor="middle" className="grafica__etiqueta">
              {d.hora}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
