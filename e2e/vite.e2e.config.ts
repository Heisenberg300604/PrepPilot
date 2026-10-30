import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: r('..'),
  plugins: [react()],
  define: { 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify('pk_test_e2e_double') },
  resolve: { alias: [{ find: '@clerk/clerk-react', replacement: r('./clerk-mock.tsx') }, { find: '@', replacement: r('../src') }] },
  server: { port: 5180, strictPort: true, proxy: { '/api': { target: 'http://localhost:4100', changeOrigin: true } } },
});
