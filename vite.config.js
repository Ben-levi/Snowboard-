import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on GitHub Pages under any repo path.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Firebase SDK is most of the bundle; it's expected.
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
  },
});
