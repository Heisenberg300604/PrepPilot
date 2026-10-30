import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      // In development the API runs on API_PORT; same-origin proxying avoids CORS entirely.
      proxy: { '/api': { target: `http://localhost:${env.API_PORT || 4000}`, changeOrigin: true } },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  };
});
