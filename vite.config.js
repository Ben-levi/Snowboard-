import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages under any repo path.
// Two pages: the gear app (index.html) and the snowboard simulation (ride.html).
export default defineConfig({
  base: './',
  plugins: [react()],
  // Firebase (main chunk) and three.js (lazy 3D chunk) are big by nature.
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: { input: { main: 'index.html', ride: 'ride.html' } },
  },
  test: {
    environment: 'node',
  },
});
