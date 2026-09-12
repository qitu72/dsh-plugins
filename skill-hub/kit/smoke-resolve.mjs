// Smoke test: import the built host bundle and exercise resolveRoots().
const mod = await import('file:///D:/aolong/repos/dsh-plugins/skill-hub/kit/lib/index.js')
if (typeof mod.resolveRoots !== 'function') {
  console.error('FAIL: resolveRoots not exported')
  process.exit(1)
}
const roots = mod.resolveRoots()
console.log('discovered groups:', roots.length)
for (const r of roots) console.log('  -', r.id.padEnd(14), r.label.padEnd(18), r.path)
if (!roots.length) { console.error('FAIL: empty roots'); process.exit(1) }
console.log('SMOKE OK')
