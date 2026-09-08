/**
 * skill-hub — client half.
 *
 * Injects a "🧩 技能" button into the conversation composer input (slot
 * `conversation.input.left`). Clicking it opens a panel that lists the user's
 * three-sided skill library. The browser half CANNOT list directories itself:
 * the built-in `host.listDirectory` RPC is gated behind the `browse`
 * directory-picker capability, which is disabled on a local loopback desktop
 * (the picker resolves to `native` → `directory-picker-unavailable`). Instead
 * the host half registers a same-origin HTTP route (`/api/skill-hub/list`,
 * see index.js) that reads the three skill roots over Node's fs; this half
 * just fetches that JSON.
 */

/** In the __ModuleLoader__ CJS factory path the closure only exposes `require`,
 *  never a bare `React`. The module system seeds `react` into the table, so pull
 *  it explicitly. Without this, slot rendering throws "React is not defined" and
 *  the entry is silently dropped by the slot supervisor (no console error, but
 *  no button either). */
const React = (() => {
  try { return require('react') } catch { return (typeof window !== 'undefined' && window.React) || null }
})()

/** Fetch the host half's skill-library JSON (`{ groups: [...] }`). */
function fetchGroups() {
  return fetch('/api/skill-hub/list', { headers: { accept: 'application/json' } })
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return res.json()
    })
    .then((data) => (data && data.groups) || [])
}

/** Fetch the installed plugins list (`{ installed: [...], enabledCount, totalCount }`). */
function fetchPlugins() {
  return fetch('/api/skill-hub/plugins', { headers: { accept: 'application/json' } })
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return res.json()
    })
}

/** Toggle a plugin's enabled state; returns the parsed response. */
function togglePlugin(name, enable) {
  return fetch('/api/skill-hub/plugins/toggle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, enable }),
  }).then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
  })
}

function SkillPicker(props) {
  const useInput = props.useInput
  const input = useInput ? useInput((s) => s) : null
  const latest = React.useRef({})
  latest.current = { draft: input && typeof input.draft === 'string' ? input.draft : '' }
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState('skills') // 'skills' | 'plugins'
  const [query, setQuery] = React.useState('')
  const [state, setState] = React.useState({ loading: false, error: null, groups: [] })
  const [plugins, setPlugins] = React.useState({ loading: false, error: null, items: [], dirty: false })
  const wrapRef = React.useRef(null)

  const load = React.useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    fetchGroups()
      .then((groups) => setState({ loading: false, error: null, groups }))
      .catch((err) => setState({ loading: false, error: String((err && err.message) || err), groups: [] }))
  }, [])

  const loadPlugins = React.useCallback(() => {
    setPlugins((s) => ({ ...s, loading: true, error: null }))
    fetchPlugins()
      .then((data) => setPlugins({ loading: false, error: null, items: data.installed || [], dirty: false }))
      .catch((err) => setPlugins({ loading: false, error: String((err && err.message) || err), items: [], dirty: false }))
  }, [])

  React.useEffect(() => {
    if (open && tab === 'skills' && state.groups.length === 0 && !state.loading && !state.error) load()
  }, [open, tab, state, load])

  React.useEffect(() => {
    if (open && tab === 'plugins' && plugins.items.length === 0 && !plugins.loading && !plugins.error && !plugins.dirty) loadPlugins()
  }, [open, tab, plugins, loadPlugins])

  // Close the panel when clicking anywhere outside of the whole widget.
  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  // Current dsh InputActions API (see ui-conversation input/contract.ts):
  // setDraft(text) writes the FULL draft, so always rebuild from the live
  // draft read via the useInput hook. We do NOT auto-submit. No cursor-level
  // insertText / append exists on the actions face.
  // Skill-first (plan A): every @reference already in the draft is gathered
  // to the FRONT (original order), the new @token joins the end of that
  // reference zone (deduped), and the remaining prose follows — so the draft
  // always ends up as「@refs… 正文」no matter how it was typed before.
  const insert = (name) => {
    try {
      const a = props.inputActions
      if (a && typeof a.setDraft === 'function') {
        const token = '@' + name
        const base = String(latest.current.draft || '')
        const refs = []
        const body = []
        for (const line of base.split(/\r?\n/)) {
          const kept = line.replace(/(^|\s)@[^\s]+/g, (m, pre) => {
            refs.push(m.slice(pre.length))
            return pre === '' ? '' : ' '
          })
          body.push(kept)
        }
        if (refs.indexOf(token) === -1) refs.push(token)
        const bodyText = body.join('\n').replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '')
        const next = refs.join(' ') + (bodyText ? ' ' + bodyText : '')
        a.setDraft(next)
      }
    } catch (_) { /* best effort */ }
    setOpen(false)
  }

  // Toggle a plugin on/off. On success marks dirty so the UI can show the
  // "restart required" banner. Errors surface inline per-item.
  const onToggle = (name, enable) => {
    setPlugins((s) => ({ ...s, items: s.items.map((p) => p.name === name ? { ...p, _busy: true } : p) }))
    togglePlugin(name, enable)
      .then((r) => {
        setPlugins((s) => ({
          ...s,
          items: s.items.map((p) => p.name === name ? { ...p, enabled: enable, _busy: false } : p),
          dirty: s.dirty || (r && r.restartRequired),
        }))
      })
      .catch((err) => {
        setPlugins((s) => ({
          ...s,
          items: s.items.map((p) => p.name === name ? { ...p, _busy: false, _err: String((err && err.message) || err) } : p),
        }))
      })
  }

  // Case-insensitive filter over skill name + description.
  const q = query.trim().toLowerCase()
  const match = (s) => !q
    || s.name.toLowerCase().includes(q)
    || (s.description && s.description.toLowerCase().includes(q))

  const pluginQ = q
  const pluginMatch = (p) => !pluginQ
    || p.name.toLowerCase().includes(pluginQ)
    || (p.description && p.description.toLowerCase().includes(pluginQ))

  const enabledCount = plugins.items.filter((p) => p.enabled).length

  return React.createElement('div', { className: 'skhub_wrap', ref: wrapRef },
    React.createElement('button', {
      type: 'button',
      className: 'skhub_btn',
      title: '技能库 / 插件管理（点击展开）',
      onClick: () => setOpen((o) => !o),
    }, '🧩 技能'),
    open && React.createElement('div', { className: 'skhub_panel' },
      // Tab bar
      React.createElement('div', { className: 'skhub_tabs' },
        React.createElement('button', {
          className: 'skhub_tab' + (tab === 'skills' ? ' skhub_tab_active' : ''),
          onClick: () => setTab('skills'),
        }, '技能'),
        React.createElement('button', {
          className: 'skhub_tab' + (tab === 'plugins' ? ' skhub_tab_active' : ''),
          onClick: () => setTab('plugins'),
        }, '插件' + (plugins.items.length ? ' (' + enabledCount + '/' + plugins.items.length + ')' : '')),
      ),
      // Search (shared across tabs)
      React.createElement('input', {
        type: 'text',
        className: 'skhub_search',
        placeholder: tab === 'skills' ? '搜索技能名或简介…' : '搜索插件名或简介…',
        value: query,
        onChange: (e) => setQuery(e.target.value),
      }),
      // --- Skills tab ---
      tab === 'skills' && [
        state.error && React.createElement('div', { className: 'skhub_err', key: 'err' }, '读取失败：' + state.error),
        state.loading && React.createElement('div', { className: 'skhub_hint', key: 'ld' }, '加载中…'),
        !state.loading && !state.error && state.groups.map((g) => {
          const skills = (g.skills || []).filter(match)
          return React.createElement('div', { className: 'skhub_group', key: g.id },
            React.createElement('div', { className: 'skhub_group_title' }, g.label + '（' + skills.length + '）'),
            React.createElement('div', { className: 'skhub_list' },
              skills.length
                ? skills.map((s) => React.createElement('div', { className: 'skhub_item', key: s.name, onClick: () => insert(s.name) },
                    React.createElement('div', { className: 'skhub_item_name' }, s.name),
                    s.description && React.createElement('div', { className: 'skhub_item_desc' }, s.description),
                  ))
                : React.createElement('div', { className: 'skhub_hint' }, (g.error ? '读取失败' : (q ? '无匹配技能' : '（空）'))),
            ),
          )
        }),
      ],
      // --- Plugins tab ---
      tab === 'plugins' && [
        plugins.error && React.createElement('div', { className: 'skhub_err', key: 'perr' }, '读取失败：' + plugins.error),
        plugins.loading && React.createElement('div', { className: 'skhub_hint', key: 'pld' }, '加载中…'),
        plugins.dirty && React.createElement('div', { className: 'skhub_restart', key: 'restart' },
          '已修改，需重启 dsh 生效',
          React.createElement('button', {
            className: 'skhub_restart_btn',
            onClick: () => { try { fetch('/api/skill-hub/restart', { method: 'POST' }) } catch (_) {} window.location.reload() },
          }, '重启并刷新'),
        ),
        !plugins.loading && !plugins.error && plugins.items.filter(pluginMatch).map((p) =>
          React.createElement('div', { className: 'skhub_pitem' + (p.enabled ? ' skhub_pitem_on' : ''), key: p.name },
            React.createElement('div', { className: 'skhub_pitem_info' },
              React.createElement('div', { className: 'skhub_pitem_name' }, p.name + (p.version ? ' @' + p.version : '')),
              p.description && React.createElement('div', { className: 'skhub_pitem_desc' }, p.description),
              p._err && React.createElement('div', { className: 'skhub_err' }, p._err),
            ),
            React.createElement('button', {
              className: 'skhub_switch' + (p.enabled ? ' skhub_switch_on' : ''),
              disabled: !!p._busy,
              onClick: () => onToggle(p.name, !p.enabled),
              title: p.enabled ? '点击禁用（需重启生效）' : '点击启用（需重启生效）',
            }, p.enabled ? '已启用' : '已禁用'),
          ),
        ),
      ],
    ),
  )
}

/** cordis client half: export the plugin definition via module.exports. */
module.exports = {
  inject: ['slots', 'connection'],
  apply(ctx) {
    const slots = ctx.slots

    // Styles are injected via the DOM (not a `styles` service) — the CJS
    // ModuleLoader path does not expose `styles`; claimStyles auto-tags
    // untagged <style> elements with data-plugin=skill-hub.
    const sheet = document.createElement('style')
    sheet.textContent = `
.skhub_wrap { position: relative; display: inline-block; }
.skhub_btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border, #2a2f3a); background: var(--bg-elev, #1b1f27);
  color: var(--text, #e6e6e6); font-size: 12px; line-height: 18px;
}
.skhub_btn:hover { background: var(--bg-elev-2, #232833); }
.skhub_panel {
  position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 50;
  width: 340px; max-height: 420px; overflow-y: auto;
  border: 1px solid var(--border, #2a2f3a); border-radius: 8px;
  background: var(--bg-elev, #1b1f27); box-shadow: 0 8px 24px rgba(0,0,0,.35);
  padding: 8px; color: var(--text, #e6e6e6); font-size: 12px;
}
.skhub_head { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 6px; }
.skhub_search {
  width: 100%; box-sizing: border-box; margin-bottom: 6px; padding: 4px 8px;
  border-radius: 6px; border: 1px solid var(--border, #2a2f3a);
  background: var(--bg-elev-2, #232833); color: var(--text, #e6e6e6);
  font-size: 12px; outline: none;
}
.skhub_search:focus { border-color: var(--accent, #3a6df0); }
.skhub_group { margin-bottom: 10px; }
.skhub_group_title { opacity: .8; font-weight: 600; margin-bottom: 4px; }
.skhub_list { display: flex; flex-direction: column; gap: 4px; }
.skhub_item {
  padding: 5px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border, #2a2f3a); background: var(--bg-elev-2, #232833);
}
.skhub_item:hover { border-color: var(--accent, #3a6df0); }
.skhub_item_name { font-weight: 600; }
.skhub_item_desc {
  opacity: .6; margin-top: 2px; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.skhub_hint { opacity: .6; }
.skhub_err { color: #ff6b6b; }
/* tab bar */
.skhub_tabs { display: flex; gap: 4px; margin-bottom: 6px; }
.skhub_tab {
  flex: 1; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 12px;
  border: 1px solid var(--border, #2a2f3a); background: transparent; color: var(--text, #e6e6e6);
}
.skhub_tab:hover { background: var(--bg-elev-2, #232833); }
.skhub_tab_active { background: var(--bg-elev-2, #232833); border-color: var(--accent, #3a6df0); font-weight: 600; }
/* restart banner */
.skhub_restart {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 8px; margin-bottom: 6px; border-radius: 6px;
  background: rgba(58,109,240,.12); border: 1px solid var(--accent, #3a6df0); font-size: 11px;
}
.skhub_restart_btn {
  padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;
  border: 1px solid var(--accent, #3a6df0); background: var(--accent, #3a6df0); color: #fff;
}
.skhub_restart_btn:hover { opacity: .85; }
/* plugin item */
.skhub_pitem {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
  padding: 6px 8px; margin-bottom: 4px; border-radius: 6px;
  border: 1px solid var(--border, #2a2f3a); background: var(--bg-elev-2, #232833);
}
.skhub_pitem_on { border-color: rgba(58,109,240,.5); }
.skhub_pitem_info { flex: 1; min-width: 0; }
.skhub_pitem_name { font-weight: 600; }
.skhub_pitem_desc {
  opacity: .6; margin-top: 2px; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
/* toggle switch button */
.skhub_switch {
  flex-shrink: 0; padding: 3px 10px; border-radius: 12px; cursor: pointer; font-size: 11px;
  border: 1px solid var(--border, #2a2f3a); background: transparent; color: var(--text, #e6e6e6);
  white-space: nowrap;
}
.skhub_switch:disabled { opacity: .5; cursor: wait; }
.skhub_switch_on { background: var(--accent, #3a6df0); border-color: var(--accent, #3a6df0); color: #fff; }
/* Companion UI fixes (2026-09-08, round-3, per owner feedback):
   1) Hide the dsh-at-file reference rail (the pill row above the composer) -
      owner prefers the WorkBuddy-style INLINE look instead.
   2) Make inline @ text references read as grey rounded pills (WorkBuddy
      style), mirroring the core ReferenceChip aesthetics.
   3) Enforce the ghost style on the composer-attachments toolbar buttons -
      in some environments the plugin's own stylesheet fails to apply and
      they fall back to ugly native button chrome. */
.dsh_atFile_rail { display: none !important; }
[data-composer-text-ref] { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); border-radius: 6px; padding: 1px 6px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.dsh-ap-wrap .dsh-ap-btn { border: none !important; background: transparent !important; box-shadow: none !important; }
`
    document.head.appendChild(sheet)

    slots.inject('conversation.input.left', () => slots.register(
      { name: 'conversation.input.left', id: 'skill-hub', order: 20 },
      (props) => React.createElement(SkillPicker, { inputActions: props.inputActions, useInput: props.useInput }),
    ))
  },
}
