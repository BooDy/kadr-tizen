/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function tizenClassicBundlePlugin() {
  return {
    name: 'vite-plugin-tizen-classic-bundle',
    transformIndexHtml(html: string) {
      // 1. Remove type="module" and crossorigin to prevent file:// CORS blocking in Tizen Chromium 69
      let transformed = html
        .replace(/<script type="module" crossorigin src="(.*?)"><\/script>/g, '<script defer src="$1"></script>')
        .replace(/<script type="module" src="(.*?)"><\/script>/g, '<script defer src="$1"></script>');

      // 2. Add an on-screen diagnostic error overlay in case of any runtime crash
      const errorTrapScript = `
    <script>
      (function() {
        function showStartupError(title, err) {
          var el = document.getElementById('kadr-startup-error');
          if (!el) {
            el = document.createElement('div');
            el.id = 'kadr-startup-error';
            el.style.cssText = 'position:fixed;bottom:24px;left:24px;right:24px;background:#7f1d1d;color:#fee2e2;padding:24px;font-family:monospace;font-size:20px;z-index:999999;border:3px solid #ef4444;border-radius:12px;white-space:pre-wrap;line-height:1.5;box-shadow:0 10px 25px rgba(0,0,0,0.8);';
            (document.body || document.documentElement).appendChild(el);
          }
          el.textContent = title + '\\n' + (err && err.stack ? err.stack : (err && err.message ? err.message : err));
        }
        window.addEventListener('error', function(e) {
          showStartupError('Startup / Runtime Error:', e.error || (e.message + ' at ' + e.filename + ':' + e.lineno + ':' + e.colno));
        });
        window.addEventListener('unhandledrejection', function(e) {
          showStartupError('Unhandled Promise Rejection:', e.reason);
        });
      })();
    </script>`;

      transformed = transformed.replace('</head>', errorTrapScript + '\n  </head>');
      return transformed;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tizenClassicBundlePlugin(),
  ],
  base: './', // Relative base for Tizen WGT widget filesystem
  build: {
    target: 'chrome69', // Tizen 5.5+ embedded Chromium runtime
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'KadrTV',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
});
