import { Routes, Route, Navigate } from 'react-router-dom';
import { RutaProtegida } from './RutaProtegida.jsx';
import { LayoutPrincipal } from '../layouts/LayoutPrincipal.jsx';
import { Login } from '../pages/Login.jsx';
import { Tablero } from '../pages/Tablero.jsx';
import { Lineas } from '../pages/Lineas.jsx';
import { LineaDetalle } from '../pages/LineaDetalle.jsx';
import { Estaciones } from '../pages/Estaciones.jsx';
import { EstacionDetalle } from '../pages/EstacionDetalle.jsx';
import { Flota } from '../pages/Flota.jsx';
import { Parqueos } from '../pages/Parqueos.jsx';
import { Alertas } from '../pages/Alertas.jsx';
import { Monitoreo } from '../pages/Monitoreo.jsx';
import { MiExpediente } from '../pages/MiExpediente.jsx';
import { MiCobertura } from '../pages/MiCobertura.jsx';
import { Personal } from '../pages/Personal.jsx';
import { Usuarios } from '../pages/Usuarios.jsx';
import { SinPermiso, NoEncontrado } from '../pages/SinPermiso.jsx';
import { MODULOS } from '../utils/constantes.js';

/**
 * Cada ruta declara el modulo y el nivel que exige, de modo que el arbol de
 * rutas es una lectura directa de la matriz de permisos (RF-15).
 */
export function Rutas() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={(
          <RutaProtegida>
            <LayoutPrincipal />
          </RutaProtegida>
        )}
      >
        <Route index element={<Tablero />} />

        <Route
          path="lineas"
          element={(
            <RutaProtegida modulo={MODULOS.LINEAS_ESTACIONES} nivel="L">
              <Lineas />
            </RutaProtegida>
          )}
        />
        <Route
          path="lineas/:id"
          element={(
            <RutaProtegida modulo={MODULOS.LINEAS_ESTACIONES} nivel="L">
              <LineaDetalle />
            </RutaProtegida>
          )}
        />

        <Route
          path="estaciones"
          element={(
            <RutaProtegida modulo={MODULOS.LINEAS_ESTACIONES} nivel="L">
              <Estaciones />
            </RutaProtegida>
          )}
        />
        <Route
          path="estaciones/:id"
          element={(
            <RutaProtegida modulo={MODULOS.LINEAS_ESTACIONES} nivel="L">
              <EstacionDetalle />
            </RutaProtegida>
          )}
        />

        <Route
          path="flota"
          element={(
            <RutaProtegida modulo={MODULOS.FLOTA} nivel="L">
              <Flota />
            </RutaProtegida>
          )}
        />
        <Route
          path="parqueos"
          element={(
            <RutaProtegida modulo={MODULOS.FLOTA} nivel="L">
              <Parqueos />
            </RutaProtegida>
          )}
        />

        <Route
          path="alertas"
          element={(
            <RutaProtegida modulo={MODULOS.MONITOREO} nivel="L">
              <Alertas />
            </RutaProtegida>
          )}
        />

        <Route
          path="monitoreo"
          element={(
            <RutaProtegida modulo={MODULOS.MONITOREO} nivel="E">
              <Monitoreo />
            </RutaProtegida>
          )}
        />
        <Route
          path="mi-expediente"
          element={(
            <RutaProtegida modulo={MODULOS.PERSONAL} nivel="L">
              <MiExpediente />
            </RutaProtegida>
          )}
        />
        <Route
          path="mi-cobertura"
          element={(
            <RutaProtegida modulo={MODULOS.PERSONAL} nivel="E">
              <MiCobertura />
            </RutaProtegida>
          )}
        />
        <Route
          path="personal"
          element={(
            <RutaProtegida modulo={MODULOS.PERSONAL} nivel="L">
              <Personal />
            </RutaProtegida>
          )}
        />

        <Route
          path="usuarios"
          element={(
            <RutaProtegida modulo={MODULOS.SEGURIDAD} nivel="E">
              <Usuarios />
            </RutaProtegida>
          )}
        />

        <Route path="sin-permiso" element={<SinPermiso />} />
        <Route path="*" element={<NoEncontrado />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
