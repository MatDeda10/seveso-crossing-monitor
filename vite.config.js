import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Deve corrispondere esattamente al nome della repository su GitHub Pages.
  base: '/seveso-crossing-monitor/',
});
