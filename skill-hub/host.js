// skill-hub host half (pkg-2) — restored from cordis_inspect_self
// Usage: pass this file's content as code.host to cordis_define.
// The line below is the plugin function body (do not wrap further).
return {
  apply(ctx) {
    const fs = ctx.get('fs')
    if (fs === undefined) return

    // The three client skill roots (single source of truth per client).
    const LIBS = [
      { id: 'AutoClaw', path: 'C:\\Users\\七兔\\.openclaw-autoclaw\\skills' },
      { id: 'CodeBuddy', path: 'C:\\Users\\七兔\\.codebuddy\\skills' },
      { id: 'WorkBuddy', path: 'C:\\Users\\七兔\\.workbuddy\\skills' },
    ]

    // Parse the YAML frontmatter block of a SKILL.md (name + description only).
    function parseFrontmatter(text) {
      const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
      if (!m) return { name: '', description: '' }
      const body = m[1]
      let name = ''
      let description = ''
      const nameM = /^name\s*:\s*['"]?([^'"\r\n]+)['"]?/m.exec(body)
      if (nameM) name = nameM[1].trim()
      const descM = /^description\s*:\s*>?\s*\r?\n?([\s\S]*?)(?=^\w+\s*:|$)/m.exec(body)
      if (descM) description = descM[1].replace(/^\s*[>|+-]\s*/gm, ' ').replace(/\s+/g, ' ').trim()
      return { name, description }
    }

    async function scanLib(lib) {
      const out = []
      try {
        const root = await fs.resolve(lib.path)
        const entries = await fs.listDir(root)
        for (const entry of entries) {
          if (entry.type !== 'directory') continue
          // find the SKILL.md definition file (case variants), sequentially
          let defName
          for (const n of ['SKILL.md', 'skill.md', 'SKILL.MD']) {
            try {
              const t = await fs.resolve(lib.path + '\\' + entry.name + '\\' + n)
              const info = await fs.stat(t)
              if (info !== undefined && info.type === 'file') { defName = n; break }
            } catch { /* keep trying other cases */ }
          }
          if (!defName) continue
          try {
            const target = await fs.resolve(lib.path + '\\' + entry.name + '\\' + defName)
            const text = await fs.readText(target)
            const fm = parseFrontmatter(text)
            out.push({ name: fm.name || entry.name, dir: entry.name, description: fm.description, path: lib.path + '\\' + entry.name + '\\' + defName })
          } catch { /* skip unreadable skill */ }
        }
      } catch { /* skip missing lib */ }
      return out
    }

    harness.handle('skillHub.list', async () => {
      const all = await Promise.all(LIBS.map(scanLib))
      const byKey = new Map()
      for (let i = 0; i < LIBS.length; i++) {
        for (const s of all[i]) {
          const key = s.dir
          const existing = byKey.get(key)
          if (existing) {
            existing.libs.push(LIBS[i].id)
            if (!existing.description && s.description) existing.description = s.description
            if (!existing.name) existing.name = s.name
          } else {
            byKey.set(key, { name: s.name, dir: s.dir, description: s.description, libs: [LIBS[i].id], path: s.path })
          }
        }
      }
      return { libs: LIBS.map(l => l.id), skills: [...byKey.values()].sort((a, b) => a.dir.localeCompare(b.dir)) }
    })
  },
}
