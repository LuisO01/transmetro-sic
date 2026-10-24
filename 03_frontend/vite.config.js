import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // El frontend llama a /api/... y Vite lo reenvia a la API en desarrollo,
    // con lo que no hay problemas de CORS ni URLs absolutas en el codigo.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
