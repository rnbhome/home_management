import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base must match the GitHub Pages path: https://<user>.github.io/home_management/
export default defineConfig({
  plugins: [react()],
  base: '/home_management/'
});
