import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { config as loadDotenv } from 'dotenv';
import { readTokenFromEnvFile } from './src/env-file';

loadDotenv({ quiet: true });

const apiPort = Number(process.env.PORT ?? 4317);
const webPort = Number(process.env.DEV_WEB_PORT ?? 5173);

// In dev, Vite serves index.html, so it injects the API token the same way the server does in production.
function injectToken(): Plugin {
  return {
    name: 'quipply-inject-token',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace('__QUIPPLY_TOKEN__', readTokenFromEnvFile()),
  };
}

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss(), injectToken()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
});
