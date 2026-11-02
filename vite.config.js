import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);

// GoJS is far larger than everything else combined, so production builds leave it
// out of the bundle and load the same version as an ES module from a CDN
// (browser-cached across pages and deploys). Dev server keeps using node_modules.
function gojsVersion() {
  // gojs' "exports" hides package.json, so locate it from the resolved entry file.
  const pkgPath = resolve(dirname(require.resolve('gojs')), '..', 'package.json');
  return JSON.parse(readFileSync(pkgPath, 'utf8')).version;
}

function gojsFromCdn() {
  const url = `https://cdn.jsdelivr.net/npm/gojs@${gojsVersion()}/release/go.mjs`;
  return {
    name: 'gojs-from-cdn',
    apply: 'build',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'gojs') return { id: url, external: true };
      return null;
    },
  };
}

export default defineConfig({
  root: './',
  base: './',
  build: {
    rollupOptions: {
      input: {
        'function-planner': resolve(__dirname, 'function-planner.html'),
        'call-graph': resolve(__dirname, 'call-graph.html'),
        'ipo': resolve(__dirname, 'ipo.html'),
        'grades': resolve(__dirname, 'grades.html'),
        'number-guess': resolve(__dirname, 'number-guess.html'),
        'hangman-planner': resolve(__dirname, 'hangman.html'),
        'bigrams': resolve(__dirname, 'bigrams.html'),
        'cell-phone-family-plan': resolve(__dirname, 'cell-phone-family-plan.html'),
        'madlibs': resolve(__dirname, 'madlibs.html'),
        'final': resolve(__dirname, 'final.html'),
      },
    },
  },
  plugins: [gojsFromCdn()],
  server: {
    open: '/function-planner.html'
  }
});
