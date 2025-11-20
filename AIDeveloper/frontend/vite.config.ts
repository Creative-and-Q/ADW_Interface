import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
    fs: {
      // Allow serving files from the modules directory
      allow: [
        '..',
        '../../modules',
      ],
    },
  },
  resolve: {
    alias: {
      '@modules': path.resolve(__dirname, '../../modules'),
    },
    // Ensure shared dependencies are resolved from frontend's node_modules
    dedupe: ['react', 'react-dom', 'react-router-dom', 'lucide-react', 'date-fns', 'react-hot-toast'],
  },
  optimizeDeps: {
    // Include module dependencies in optimization
    include: ['react', 'react-dom', 'react-router-dom', 'lucide-react', 'date-fns', 'react-hot-toast'],
  },
});
