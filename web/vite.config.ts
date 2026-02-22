import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API calls to the Fastify server during development
    proxy: {
      '/v1': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/agents': { target: 'http://localhost:3000', ws: true },
    },
  },
});
