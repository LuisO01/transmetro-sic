import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';
import { MODULOS } from '../utils/constantes.js';

/**
 * El menu se construye a partir de la matriz de permisos: cada perfil solo ve
 * los modulos a los que tiene acceso (RF-15).
 */
const NAVEGACION = [
  { ruta: '/', etiqueta: 'Tablero', modulo: null, exacta: true },
  { ruta: '/monitoreo', etiqueta: 'Monitoreo', modulo: MODULOS.MONITOREO, nivel: 'E' },
  { ruta: '/lineas', etiqueta: 'Lineas', modulo: MODULOS.LINEAS_ESTACIONES },
  { ruta: '/estaciones', etiqueta: 'Estaciones', modulo: MODULOS.LINEAS_ESTACIONES },
  { ruta: '/flota', etiqueta: 'Flota', modulo: MODULOS.FLOTA },
  { ruta: '/parqueos', etiqueta: 'Parqueos', modulo: MODULOS.FLOTA },
  { ruta: '/personal', etiqueta: 'Personal', modulo: MODULOS.PERSONAL, nivel: 'L', ocultarSi: 'propio' },
  { ruta: '/mi-expediente', etiqueta: 'Mi expediente', modulo: MODULOS.PERSONAL, nivel: 'L', soloRol: 'PILOTO' },
  { ruta: '/mi-cobertura', etiqueta: 'Mi cobertura', modulo: MODULOS.PERSONAL, nivel: 'E', soloRol: 'GUARDIA' },
  { ruta: '/alertas', etiqueta: 'Alertas', modulo: MODULOS.MONITOREO },
  { ruta: '/usuarios', etiqueta: 'Usuarios', modulo: MODULOS.SEGURIDAD, nivel: 'E' },
];

export function LayoutPrincipal() {
  const { usuario, cerrarSesion, puede } = useAuth();
  const navegar = useNavigate();

  // Un enlace se muestra solo si el permiso alcanza y si corresponde al rol:
  // el piloto ve "Mi expediente", el guardia "Mi cobertura", y quien tiene
  // ambito propio no ve el listado general de personal.
  const visibles = NAVEGACION.filter((item) => {
    if (item.modulo && !puede(item.modulo, item.nivel ?? 'L')) return false;
    if (item.soloRol && !usuario?.roles?.includes(item.soloRol)) return false;
    if (item.ocultarSi && usuario?.ambito === item.ocultarSi) return false;
    return true;
  });

  async function salir() {
    await cerrarSesion();
    navegar('/login', { replace: true });
  }

  return (
    <div className="app">
      <header className="app__cabecera">
        <div className="app__marca">
          <span className="app__logo" aria-hidden="true">TM</span>
          <div>
            <strong>SIC Transmetro</strong>
            <small>Sistema de Informacion y Control</small>
          </div>
        </div>

        <div className="app__usuario">
          <div className="app__usuario-datos">
            <strong>{usuario?.nombreCompleto}</strong>
            <small>
              {usuario?.roles?.join(', ')}
              {usuario?.municipalidad ? ` - ${usuario.municipalidad}` : ''}
            </small>
          </div>
          <button type="button" className="boton boton--secundario" onClick={salir}>
            Salir
          </button>
        </div>
      </header>

      <div className="app__cuerpo">
        <nav className="app__menu" aria-label="Menu principal">
          {visibles.map((item) => (
            <NavLink
              key={item.ruta}
              to={item.ruta}
              end={item.exacta}
              className={({ isActive }) => `app__enlace${isActive ? ' app__enlace--activo' : ''}`}
            >
              {item.etiqueta}
            </NavLink>
          ))}
        </nav>

        <main className="app__contenido">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
