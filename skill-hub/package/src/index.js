/**
 * skill-hub — host half.
 *
 * Reads the three-sided skill library over Node's fs and exposes it through a
 * custom `webServer` HTTP route (`/api/skill-hub/list`). This deliberately
 * bypasses the built-in `host.listDirectory` RPC, which is gated behind the
 * `browse` directory-picker capability — disabled on a local loopback desktop
 * where the picker resolves to `native` (system chooser dialog) — and would
 * therefore always fail with `directory-picker-unavailable` no matter how the
 * RPC envelope is unwrapped. The client half (browser) just fetches the
 * same-origin JSON endpoint.
 *
 * Static npm extensions cannot reach the dynamic-cordis `harness` sandbox, so
 * `webServer` is the sanctioned host-side service seam for this shape.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Cordis plugin name (the profile's config tree references this id). */
export const name = 'skill-hub'
/** Required services: the browser HTTP carrier of the dsh web composition. */
export const inject = ['webServer']

/**
 * Is this entry a real directory? `Dirent.isDirectory()` returns `false` for
 * junctions / symlinks (the CodeBuddy root mirrors AutoClaw skills via 70+
 * junctions), so follow links with `statSync` before giving up.
 */
function isSkillDir(parent, entry) {
  if (entry.name.startsWith('.')) return false
  if (entry.isDirectory()) return true
  if (entry.isSymbolicLink()) {
    try { return statSync(join(parent, entry.name)).isDirectory() } catch { return false }
  }
  return false
}

/**
 * Extract the `description` from a SKILL.md frontmatter block.
 * Handles `description: plain`, `description: "quoted"`, and the folded /
 * literal block forms (`>` / `|` with indented continuation lines). Strips a
 * UTF-8 BOM (some editors add one, which otherwise breaks the `^---` anchor).
 * Falls back to the first non-empty prose paragraph when the frontmatter is
 * missing or has no `description` field.
 */
function parseDescription(mdText) {
  mdText = mdText.replace(/^\uFEFF/, '') // strip UTF-8 BOM
  const fm = mdText.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fm) {
    const body = fm[1]
    const m = body.match(/^description\s*:\s*(.*)$/m)
    if (m) {
      let first = m[1].trim()
      if ((first.startsWith('"') && first.endsWith('"')) || (first.startsWith("'") && first.endsWith("'"))) {
        first = first.slice(1, -1)
      }
      if (first === '>' || first === '|') {
        const rest = body.slice(m.index + m[0].length)
        const lines = []
        for (const line of rest.split(/\r?\n/)) {
          if (!line.trim()) continue // blank line inside a folded block
          if (!/^\s/.test(line)) break // next top-level YAML key
          lines.push(line.trim())
        }
        first = lines.join(' ').replace(/\s+/g, ' ').trim()
      }
      if (first) return first
    }
  }
  // Fallback: first non-empty, non-heading prose paragraph after the frontmatter.
  const rest = fm ? mdText.slice(fm[0].length) : mdText
  for (const line of rest.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || /^#/.test(t) || /^<!--/.test(t)) continue
    return t.replace(/^[-*>•\d.\s]+/, '').replace(/[*_`]/g, '').slice(0, 140).trim()
  }
  return ''
}

/** Read one skill's directory into `{ name, description }`. */
function readSkill(parent, entry) {
  const name = entry.name
  const mdPath = join(parent, name, 'SKILL.md')
  try {
    return { name, description: parseDescription(readFileSync(mdPath, 'utf8')) }
  } catch {
    return { name, description: '' }
  }
}

/** Read one skill root's child directories (with descriptions), sorted by name. */
function readSkillDirs(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => isSkillDir(root, e))
    .map((e) => readSkill(root, e))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Mount the same-origin JSON endpoint the browser half fetches.
 * @param ctx - cordis context carrying the injected `webServer`.
 */
export function apply(ctx) {
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/skill-hub/list',
    handler(_req, res) {
      const roots = [
        { id: 'dsh', label: 'DeepSeek Harness', path: join(homedir(), '.dsh', 'skills') },
        { id: 'codebuddy', label: 'CodeBuddy', path: join(homedir(), '.codebuddy', 'skills') },
        { id: 'workbuddy', label: 'WorkBuddy', path: join(homedir(), '.workbuddy', 'skills') },
      ]
      const groups = roots.map((root) => {
        try {
          return { ...root, skills: readSkillDirs(root.path) }
        } catch (error) {
          return { ...root, skills: [], error: String((error && error.message) || error) }
        }
      })
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ groups }))
    },
  })
}
