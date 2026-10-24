import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';
import { MensajeError } from '../components/Estado.jsx';
import { CuentasDemo } from '../components/BandaDemo.jsx';

export function Login() {
  const { iniciarSesion, autenticado, cargando } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  if (!cargando && autenticado) {
    return <Navigate to={ubicacion.state?.desde ?? '/'} replace />;
  }

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await iniciarSesion(usuario.trim(), password);
      navegar(ubicacion.state?.desde ?? '/', { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="login__tarjeta" onSubmit={enviar}>
        <div className="login__marca">
          <span className="app__logo" aria-hidden="true">TM</span>
          <h1>SIC Transmetro</h1>
          <p>Sistema de Informacion y Control</p>
        </div>

        <MensajeError error={error} />

        <label className="campo">
          <span>Usuario o correo</span>
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            required
            minLength={4}
            autoFocus
          />
        </label>

        <label className="campo">
          <span>Contrasena</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            minLength={8}
          />
        </label>

        <button type="submit" className="boton boton--primario" disabled={enviando}>
          {enviando ? 'Verificando...' : 'Ingresar'}
        </button>

        <p className="login__nota">
          La conexion viaja cifrada por HTTPS y las contrasenas se almacenan con bcrypt.
        </p>

        <CuentasDemo
          onElegir={(u, p) => {
            setUsuario(u);
            setPassword(p);
          }}
        />
      </form>
    </div>
  );
}
