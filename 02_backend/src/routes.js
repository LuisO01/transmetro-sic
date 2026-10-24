import { Router } from 'express';
import auth from './modules/auth/auth.routes.js';
import municipalidades from './modules/municipalidades/municipalidades.routes.js';
import lineas from './modules/lineas/lineas.routes.js';
import estaciones from './modules/estaciones/estaciones.routes.js';
import accesos from './modules/accesos/accesos.routes.js';
import buses from './modules/buses/buses.routes.js';
import parqueos from './modules/parqueos/parqueos.routes.js';
import alertas from './modules/alertas/alertas.routes.js';
import usuarios from './modules/usuarios/usuarios.routes.js';
import monitoreo from './modules/monitoreo/monitoreo.routes.js';
import personal from './modules/personal/personal.routes.js';
import tablero from './modules/tablero/tablero.routes.js';

const router = Router();

router.use('/auth', auth);                      // Autenticacion y sesion
router.use('/municipalidades', municipalidades); // RF-13
router.use('/lineas', lineas);                   // RF-01, RF-02, RF-05
router.use('/estaciones', estaciones);           // RF-01, RF-03, RF-13
router.use('/accesos', accesos);                 // RF-03, RF-08
router.use('/buses', buses);                     // RF-04, RF-06
router.use('/parqueos', parqueos);               // RF-06
router.use('/alertas', alertas);                 // RF-05, RF-06, RF-08, RF-09
router.use('/monitoreo', monitoreo);             // RF-09, RF-10
router.use('/personal', personal);               // RF-07, RF-08
router.use('/tablero', tablero);                 // Mapa de la red e indicadores
router.use('/usuarios', usuarios);               // RF-15

export default router;
