/**
 * Single-file client + ESM host build for skill-hub.
 *
 * Client: plain CJS bundle (no ModuleLoader wrapper).  The cordis
 * client-runner evaluates the file body inside its own async IIFE and
 * injects globals (styles, React, host, …) as closure parameters.
 * Wrapping the bundle in window.__ModuleLoader__.load() would create an
 * extra scope that blocks those injected variables → "styles is not defined".
 *
 * Host: plain ESM for Node (resolved by the profile's own module system).
 *
 * All paths are anchored to THIS file (kit/src/build.mjs), so the script
 * produces kit/lib/* no matter which directory it is invoked from. esbuild
 * is resolved from kit/src/node_modules first (the documented install
 * location), then from any hoisted location up the tree.
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const srcDir = dirname(fileURLToPath(import.meta.url)) // kit/src
const libDir = join(srcDir, '..', 'lib')               // kit/lib
const require2 = createRequire(import.meta.url)

function loadEsbuild() {
  try { return require2('esbuild') } catch { /* fall through */ }
  try { return require2(join(srcDir, 'node_modules', 'esbuild', 'lib', 'main.js')) } catch { /* fall through */ }
  throw new Error('esbuild not found. Run `npm install` inside kit/src, or use the prebuilt kit/lib.')
}

const { build } = loadEsbuild()
mkdirSync(libDir, { recursive: true })

const dshExternal = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*']

await build({
  entryPoints: [join(srcDir, 'index.js')],
  outfile: join(libDir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  external: dshExternal,
  logLevel: 'info',
})

await build({
  entryPoints: [join(srcDir, 'client', 'index.js')],
  outfile: join(libDir, 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  jsx: 'automatic',
  external: [...dshExternal, 'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'scheduler'],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'skill-hub', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})
