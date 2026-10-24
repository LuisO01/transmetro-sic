import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './store/AuthContext.jsx';
import { Rutas } from './router/index.jsx';
import { BandaDemo } from './components/BandaDemo.jsx';
import './styles/global.css';

// En GitHub Pages el sitio no cuelga de la raiz del dominio, sino de la ruta
// del repositorio; el enrutador necesita saberlo.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={base || undefined}>
      <AuthProvider>
        <BandaDemo />
        <Rutas />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
