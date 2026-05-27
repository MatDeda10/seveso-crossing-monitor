import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Deve corrispondere esattamente al nome della tua repository su GitHub
  base: '/seveso-crossing-monitor/', 
})
