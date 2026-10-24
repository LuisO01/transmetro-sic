/**
 * Aviso permanente del sitio publicado.
 *
 * El sistema real se opera con su API y su base de datos; esta copia en
 * GitHub Pages muestra los mismos datos pero no puede guardar cambios, y el
 * visitante merece saberlo desde el primer segundo y no al pulsar un boton.
 */
export function BandaDemo() {
  if (import.meta.env.VITE_MODO_DEMO !== 'true') return null;

  return (
    <div className="banda-demo" role="status">
      <strong>Demostración de solo lectura.</strong> Los datos son los reales del sistema, capturados
      de la API en ejecución. Puede recorrer todos los módulos con las cinco cuentas, pero no guardar
      cambios: las reglas de negocio viven en PostgreSQL y aquí no hay motor que las garantice.{' '}
      <a href="https://github.com/LuisO01/transmetro-sic" target="_blank" rel="noreferrer">
        Código y documentación
      </a>
    </div>
  );
}

/** Credenciales a la vista en el ingreso, porque el sitio es una demostración. */
export function CuentasDemo({ onElegir }) {
  if (import.meta.env.VITE_MODO_DEMO !== 'true') return null;

  const cuentas = [
    ['admin.general', 'Administrador general'],
    ['admin.muni.gt', 'Administrador municipal'],
    ['operador.e103', 'Operador de estación'],
    ['piloto.001', 'Piloto'],
    ['guardia.001', 'Guardia de seguridad'],
  ];

  return (
    <div className="cuentas-demo">
      <p>Elija una cuenta para entrar. La contraseña de todas es <code>Transmetro2026*</code></p>
      <ul>
        {cuentas.map(([usuario, rol]) => (
          <li key={usuario}>
            <button type="button" onClick={() => onElegir(usuario, 'Transmetro2026*')}>
              <strong>{usuario}</strong>
              <span>{rol}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
