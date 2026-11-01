import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the built `dist/` folder works from any path on any static host.
  base: './',
  build: {
    // Three.js alone is ~530 kB minified (~135 kB gzipped); that's expected, not a problem.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Three.js goes in its own "vendor" chunk: it's most of the code and rarely
        // changes, so browsers can keep it cached when only the garden changes.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
