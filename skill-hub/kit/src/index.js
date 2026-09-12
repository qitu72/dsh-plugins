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
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
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
 * Well-known Agent skill directories. Only a prefix map — the actual path is
 * always `<homedir>/<dir>/skills`, so nothing user-specific is hardcoded.
 * Agents whose directory does not exist on this machine are simply not shown.
 */
const KNOWN_ROOTS = [
  { id: 'dsh', label: 'DeepSeek Harness', dir: '.dsh' },
  { id: 'workbuddy', label: 'WorkBuddy', dir: '.workbuddy' },
  { id: 'codebuddy', label: 'CodeBuddy', dir: '.codebuddy' },
  { id: 'claude', label: 'Claude Code', dir: '.claude' },
  { id: 'codex', label: 'Codex', dir: '.codex' },
  { id: 'opencode', label: 'OpenCode', dir: '.opencode' },
  { id: 'openclaw', label: 'OpenClaw', dir: '.openclaw' },
  { id: 'autoclaw', label: 'AutoClaw', dir: '.openclaw-autoclaw' },
  { id: 'qoder', label: 'Qoder', dir: '.qoder' },
  { id: 'cursor', label: 'Cursor', dir: '.cursor' },
  { id: 'windsurf', label: 'Windsurf', dir: '.windsurf' },
  { id: 'agents', label: 'Shared (agents)', dir: '.agents' },
]

/** Canonical key for de-duplicating roots across discovery layers. */
function rootKey(path) {
  return path.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** Normalize a user-supplied root list (strings or `{id?,label?,path}` objects). */
function normalizeRootList(list) {
  return (Array.isArray(list) ? list : []).map((d) =>
    typeof d === 'string'
      ? { id: d, label: d, path: d }
      : { id: d.id || d.path, label: d.label || d.id || d.path, path: d.path },
  )
}

/**
 * Read the optional user config file `~/.dsh/skill-hub.json`:
 *   { "extraRoots": ["C:\\path\\to\\skills" | {"label":"X","path":"..."}],  // appended to auto-detected roots
 *     "roots":       [...],   // replaces everything (same shape as SKILL_HUB_DIRS)
 *     "autoScan":    false }  // disable home-dir auto discovery
 * Missing file / parse error → `{}` (never throws).
 */
function readHubConfig() {
  try {
    const cfgPath = join(homedir(), '.dsh', 'skill-hub.json')
    if (!existsSync(cfgPath)) return {}
    return JSON.parse(readFileSync(cfgPath, 'utf8')) || {}
  } catch { return {} }
}

/**
 * Discover skill roots on this machine:
 * 1. every KNOWN_ROOTS entry whose `<home>/<dir>/skills` directory exists;
 * 2. generic sweep: any first-level dot-directory under homedir containing a
 *    `skills` subdirectory that the static table missed — this is how agents
 *    unknown at authoring time are still picked up.
 */
function detectRoots() {
  const home = homedir()
  const found = []
  const seen = new Set()
  const add = (id, label, path) => {
    const key = rootKey(path)
    if (seen.has(key)) return
    try {
      if (!statSync(path).isDirectory()) return
    } catch { return }
    seen.add(key)
    found.push({ id, label, path })
  }
  for (const k of KNOWN_ROOTS) add(k.id, k.label, join(home, k.dir, 'skills'))
  let homeEntries = []
  try { homeEntries = readdirSync(home, { withFileTypes: true }) } catch { /* keep what we have */ }
  for (const e of homeEntries) {
    if (!e.name.startsWith('.') || e.name === '.') continue
    if (KNOWN_ROOTS.some((k) => k.dir === e.name)) continue // already handled
    if (e.isDirectory() || e.isSymbolicLink()) {
      const skills = join(home, e.name, 'skills')
      if (existsSync(skills)) add(e.name.slice(1), e.name.slice(1), skills)
    }
  }
  return found
}

/**
 * Resolve the skill root directories, in priority order:
 * 1. `SKILL_HUB_DIRS` env var (back-compat: replaces everything);
 * 2. `roots` in `~/.dsh/skill-hub.json` (replaces everything);
 * 3. auto-detection + `extraRoots` from the config file;
 * 4. last-resort fallback: `~/.dsh/skills` (always exists for a dsh user).
 * Exported for testability.
 */
export function resolveRoots() {
  const raw = process.env.SKILL_HUB_DIRS
  if (raw) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length) return normalizeRootList(arr)
    } catch { /* fall through */ }
  }
  const cfg = readHubConfig()
  if (Array.isArray(cfg.roots) && cfg.roots.length) return normalizeRootList(cfg.roots)
  const auto = cfg.autoScan === false ? [] : detectRoots()
  const extra = normalizeRootList(cfg.extraRoots)
  const merged = []
  const seen = new Set()
  for (const r of [...auto, ...extra]) {
    const key = rootKey(r.path)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(r)
  }
  if (merged.length) return merged
  return [{ id: 'dsh', label: 'DeepSeek Harness', path: join(homedir(), '.dsh', 'skills') }]
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
      const roots = resolveRoots()
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

  // --- Plugin manager: list installed bundles and toggle enable/disable ---
  //
  // dsh loads bundles listed in `profiles/<name>/package.json` under
  // `dsh.profile.bundles`. Packages installed in node_modules but absent
  // from that array are "installed but disabled". Toggling rewrites the
  // array in place and persists — a dsh restart is required for the boot
  // loader to pick up the change (bundles are resolved once at boot).

  /** Resolve the active profile dir (default: web) and read its manifest. */
  function readProfileManifest() {
    const profileName = process.env.DSH_PROFILE || 'web'
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    const dir = join(dshHome, 'profiles', profileName)
    const pkgPath = join(dir, 'package.json')
    const raw = readFileSync(pkgPath, 'utf8')
    const manifest = JSON.parse(raw)
    return { dir, pkgPath, raw, manifest }
  }

  /**
   * 中文简介映射表：key = 包名，value = 一句话中文说明。
   * 优先于此表；表中没有的包回退到 package.json 的 description。
   * 维护说明：新装插件时在此补一行即可，无需改 client。
   */
  const PLUGIN_DESC_ZH = {
    '@dhicoc/dsh-wuyun-liuqi': '五运六气（干支推算、病机分析、经典文献）',
    '@dsh-external/dsh-automation': '定时任务：按计划在全新会话中执行编码任务',
    '@liustack/modlens': '给纯文本模型加视觉能力（基于 Antigravity CLI）',
    '@omdsh-dev/dsh-genui': '富交互 UI 组件：图表/表单/3D/Mermaid 内嵌在回复里',
    'dsh-at-file': '@路径引用：搜索工作区文件路径但不注入内容',
    'dsh-better-sidebar': '类 VSCode 右侧栏（资源管理器/编辑器/终端/Git/浏览器）',
    'dsh-bilibili': 'B站视频分析：逐字稿优先、字幕截图、模型摘要',
    'dsh-companion': '官方伴侣：对话导出、上下文摘要、成本优化、全局检索',
    'dsh-excel-chat': 'Excel 对话式操作：建表/公式/样式/图表，自动校验',
    'dsh-office-tools': 'Office 工具：会话内创建/读写 Word/Excel/PPT',
    'dsh-plugin-sentinel': '插件安装时静态安全审计',
    'dsh-plugin-writing-guard': '学术写作检查器：增量查重、分段预处理、密度阈值',
    'dsh-stock-watch': 'A股自选股实时行情盯盘弹窗',
    'dsh-tool-writing': '长篇网文写作引擎：并行生成、设定管理、语义检索',
    'dsh-video-downloader': '视频/音频下载（B站/YouTube/抖音/小红书）',
    'dsh-web-search-pro': '增强网页搜索：多引擎路由、缓存、Playwright 渲染',
    'dshmarket': '可视化插件市场：浏览/搜索/一键安装社区插件',
    'skill-hub': '技能库与插件管理面板（本插件）',
    'vera': 'Excel 对话式操作（vera 分支版本）',
  }

  /**
   * Read a plugin's display metadata (description/version) from its own
   * package.json in the profile's node_modules. Falls back gracefully.
   * 中文简介优先取 PLUGIN_DESC_ZH 映射表；表里没有则回退原始 description。
   */
  function readPluginMeta(profileDir, pkgName) {
    const zh = PLUGIN_DESC_ZH[pkgName]
    try {
      const p = join(profileDir, 'node_modules', pkgName, 'package.json')
      const m = JSON.parse(readFileSync(p, 'utf8'))
      return { version: m.version || '', description: zh || m.description || '' }
    } catch {
      return { version: '', description: zh || '' }
    }
  }

  ctx.webServer.register({
    kind: 'exact',
    path: '/api/skill-hub/plugins',
    handler(_req, res) {
      try {
        const { dir, manifest } = readProfileManifest()
        const deps = manifest.dependencies || {}
        const bundles = manifest.dsh?.profile?.bundles || []
        const bundleSet = new Set(bundles)
        // Installed = all dependencies except the profile stub itself.
        const installed = Object.keys(deps)
          .filter((n) => n !== manifest.name)
          .map((name) => {
            const meta = readPluginMeta(dir, name)
            return {
              name,
              version: meta.version,
              description: meta.description,
              enabled: bundleSet.has(name),
            }
          })
          .sort((a, b) => a.name.localeCompare(b.name))
        const enabledCount = installed.filter((p) => p.enabled).length
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ installed, enabledCount, totalCount: installed.length }))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: String((error && error.message) || error) }))
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/api/skill-hub/plugins/toggle',
    handler(req, res) {
      // Parse the JSON body synchronously — the request is tiny and local.
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        try {
          const { name, enable } = JSON.parse(body || '{}')
          if (!name || typeof name !== 'string') {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'missing "name"' }))
            return
          }
          const { pkgPath, manifest } = readProfileManifest()
          const bundles = manifest.dsh?.profile?.bundles
          if (!Array.isArray(bundles)) {
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'profile has no dsh.profile.bundles array' }))
            return
          }
          const idx = bundles.indexOf(name)
          let changed = false
          if (enable && idx === -1) { bundles.push(name); changed = true }
          if (!enable && idx !== -1) { bundles.splice(idx, 1); changed = true }
          if (changed) {
            manifest.dsh.profile.bundles = bundles
            writeFileSync(pkgPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ name, enabled: enable, changed, restartRequired: changed }))
        } catch (error) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: String((error && error.message) || error) }))
        }
      })
    },
  })

  // Restart dsh web: spawns a detached process that waits briefly then kills
  // the current process and relaunches `dsh web`. The browser reloads itself
  // after calling this. We can't fork in-process (the web server would die
  // before responding), so we hand off to a tiny detached script.
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/skill-hub/restart',
    handler(_req, res) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ restarting: true }))
      // Give the response a moment to flush, then exit. The deploy.ps1 /
      // external supervisor (or the user) relaunches dsh. On Windows a
      // self-relaunch is unreliable across detached spawns, so we just exit
      // cleanly and let the host process manager restart us.
      setTimeout(() => process.exit(0), 300)
    },
  })
}
