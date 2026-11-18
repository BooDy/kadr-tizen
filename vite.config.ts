/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import postcss from 'postcss';
import { buildBootErrorTrapScriptTag } from './src/utils/bootTrapScript';

function tizenClassicBundlePlugin() {
  return {
    name: 'vite-plugin-tizen-classic-bundle',
    apply: 'build' as const,
    async generateBundle(this: any, _options: any, bundle: any) {
      const appJs = bundle['assets/app.js'];
      if (appJs && appJs.type === 'chunk') {
        const match = appJs.code.match(/textContent\s*=\s*`([^`]+)`/);
        if (match) {
          const rawCss = match[1].replace(/\\n/g, '\n').replace(/\\([`$\\])/g, '$1');

          const unwrapPlugin = () => ({
            postcssPlugin: 'unwrap-layers',
            AtRule: {
              layer(atRule: any) {
                if (atRule.nodes) {
                  atRule.replaceWith(atRule.nodes);
                } else {
                  atRule.remove();
                }
              },
              property(atRule: any) {
                atRule.remove();
              },
              supports(atRule: any) {
                if (atRule.params && atRule.params.includes('-webkit-hyphens:none')) {
                  if (atRule.nodes) {
                    atRule.replaceWith(atRule.nodes);
                  } else {
                    atRule.remove();
                  }
                } else if (atRule.params && atRule.params.includes('color-mix')) {
                  atRule.remove();
                }
              },
            },
            Rule(rule: any) {
              if (rule.selector && rule.selector.includes(':where(')) {
                rule.selector = rule.selector.replace(/:where\(([^()]+)\)/g, '$1');
              }
            },
            Declaration(decl: any) {
              if (decl.value && (decl.value.includes(' in oklab') || decl.value.includes(' in oklch'))) {
                decl.value = decl.value.replace(/\s+in\s+(?:oklab|oklch)\b/g, '');
              }
              if (decl.prop === 'padding-inline') {
                decl.cloneBefore({ prop: 'padding-left', value: decl.value, important: decl.important });
                decl.cloneBefore({ prop: 'padding-right', value: decl.value, important: decl.important });
                decl.remove();
              } else if (decl.prop === 'padding-block') {
                decl.cloneBefore({ prop: 'padding-top', value: decl.value, important: decl.important });
                decl.cloneBefore({ prop: 'padding-bottom', value: decl.value, important: decl.important });
                decl.remove();
              } else if (decl.prop === 'padding-inline-start') {
                decl.prop = 'padding-left';
              } else if (decl.prop === 'padding-inline-end') {
                decl.prop = 'padding-right';
              } else if (decl.prop === 'padding-block-start') {
                decl.prop = 'padding-top';
              } else if (decl.prop === 'padding-block-end') {
                decl.prop = 'padding-bottom';
              } else if (decl.prop === 'margin-inline') {
                decl.cloneBefore({ prop: 'margin-left', value: decl.value, important: decl.important });
                decl.cloneBefore({ prop: 'margin-right', value: decl.value, important: decl.important });
                decl.remove();
              } else if (decl.prop === 'margin-block') {
                decl.cloneBefore({ prop: 'margin-top', value: decl.value, important: decl.important });
                decl.cloneBefore({ prop: 'margin-bottom', value: decl.value, important: decl.important });
                decl.remove();
              } else if (decl.prop === 'margin-inline-start') {
                decl.prop = 'margin-left';
              } else if (decl.prop === 'margin-inline-end') {
                decl.prop = 'margin-right';
              } else if (decl.prop === 'margin-block-start') {
                decl.prop = 'margin-top';
              } else if (decl.prop === 'margin-block-end') {
                decl.prop = 'margin-bottom';
              } else if (decl.prop === 'inset-inline') {
                decl.cloneBefore({ prop: 'left', value: decl.value, important: decl.important });
                decl.cloneBefore({ prop: 'right', value: decl.value, important: decl.important });
                decl.remove();
              } else if (decl.prop === 'inset-block') {
                decl.cloneBefore({ prop: 'top', value: decl.value, important: decl.important });
                decl.cloneBefore({ prop: 'bottom', value: decl.value, important: decl.important });
                decl.remove();
              } else if (decl.prop === 'scale') {
                decl.prop = 'transform';
                decl.value = decl.value.includes('var(--tw-scale-x)')
                  ? 'scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))'
                  : `scale(${decl.value})`;
              } else if (decl.prop === 'translate') {
                if (decl.value.includes('var(--tw-translate-x)')) {
                  decl.prop = 'transform';
                  decl.value = 'translate(var(--tw-translate-x), var(--tw-translate-y))';
                }
              }
            },
          });
          unwrapPlugin.postcss = true;

          const res = await postcss([unwrapPlugin]).process(rawCss, { from: undefined });
          let cleanCss = res.css;
          if (!cleanCss.includes('--spacing:')) {
            cleanCss = ':root { --spacing: 0.25rem; }\n' + cleanCss;
          }
          // Downlevel modern color functions to standard rgba/hex for Chromium 69 compatibility
          cleanCss = cleanCss
            .replace(/oklab\([^)]*?\/\s*([0-9.]+)\)/g, (_m, a) => `rgba(255, 184, 0, ${a})`)
            .replace(/oklab\([^)]+\)/g, '#FFB800')
            .replace(/oklch\([^)]*?\/\s*([0-9.]+)\)/g, (_m, a) => `rgba(255, 107, 0, ${a})`)
            .replace(/oklch\([^)]+\)/g, '#FF6B00');

          // Emit standalone assets/style.css
          this.emitFile({
            type: 'asset',
            fileName: 'assets/style.css',
            source: cleanCss,
          });

          // Replace CSS in app.js with clean unwrapped CSS
          appJs.code = appJs.code.replace(
            match[0],
            `textContent=\`${cleanCss.replace(/[`$\\]/g, '\\$&')}\``
          );
        }
      }
    },
    transformIndexHtml(html: string) {
      // 1. Remove type="module" and crossorigin to prevent file:// CORS blocking in Tizen Chromium 69
      let transformed = html
        .replace(/<script type="module" crossorigin src="(.*?)"><\/script>/g, '<script defer src="$1"></script>')
        .replace(/<script type="module" src="(.*?)"><\/script>/g, '<script defer src="$1"></script>');

      // 2. Link standalone style.css for synchronous, pre-DOM CSS evaluation
      if (!transformed.includes('assets/style.css')) {
        transformed = transformed.replace('</head>', '    <link rel="stylesheet" href="./assets/style.css">\n  </head>');
      }

      // 3. Add a boot-scoped on-screen diagnostic error overlay in case of startup crash
      const errorTrapScript = buildBootErrorTrapScriptTag();

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
    testTimeout: 10000,
  },
});
