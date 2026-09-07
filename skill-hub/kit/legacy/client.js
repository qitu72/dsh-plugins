// skill-hub client half (pkg-2) — restored from cordis_inspect_self
// Usage: pass this file's content as code.client to cordis_define.
// The line below is the plugin function body (do not wrap further).
return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return

    styles.insert(`
.skhub_strip { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.skhub_btn { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border: 1px solid var(--dsw-alias-border-l2, #3a3f4b); border-radius: 14px; background: var(--dsw-alias-bg-layer-1, #1e222a); color: var(--dsw-alias-label-primary, #e8eaed); font-size: 12px; line-height: 18px; cursor: pointer; }
.skhub_btn:hover { border-color: var(--dsw-alias-brand-primary, #4d9de0); }
.skhub_panel { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2, #3a3f4b); border-radius: 10px; background: var(--dsw-alias-bg-layer-2, #171a20); max-height: 340px; overflow: hidden; }
.skhub_search { width: 100%; box-sizing: border-box; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l2, #3a3f4b); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #1e222a); color: var(--dsw-alias-label-primary, #e8eaed); font-size: 13px; outline: none; }
.skhub_search:focus { border-color: var(--dsw-alias-brand-primary, #4d9de0); }
.skhub_list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
.skhub_item { display: flex; flex-direction: column; gap: 2px; padding: 7px 10px; border-radius: 8px; cursor: pointer; }
.skhub_item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.06)); }
.skhub_itemName { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-primary, #e8eaed); font-size: 13px; }
.skhub_itemDesc { color: var(--dsw-alias-label-tertiary, #9aa3af); font-size: 12px; line-height: 16px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.skhub_badge { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #1e222a); border: 1px solid var(--dsw-alias-border-l2, #3a3f4b); color: var(--dsw-alias-label-tertiary, #9aa3af); }
.skhub_note { color: var(--dsw-alias-label-tertiary, #9aa3af); font-size: 11px; }
`)

    function SkillStrip(props) {
      const { inputActions } = props
      const [open, setOpen] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)

      const load = () => {
        host.call('skillHub.list').then((res) => {
          setData(res)
          setError(null)
        }, (err) => setError(String(err && err.message ? err.message : err)))
      }
      React.useEffect(() => { if (open && data === null) load() }, [open])

      const pick = (skill) => {
        const libs = (skill.libs || []).join(' / ')
        const draft = '请加载并使用技能「' + skill.name + '」（' + skill.dir + '）：按 ' + skill.path + ' 的 SKILL.md 说明执行' + (libs ? '（三端技能库均有：' + libs + '）' : '') + '。'
        inputActions.setDraft(draft)
        setOpen(false)
        setQuery('')
      }

      return React.createElement('div', { className: 'skhub_strip' },
        React.createElement('button', { className: 'skhub_btn', onClick: () => { setOpen(!open); if (!open && data === null) load() } },
          '🧩 技能',
          data ? ' (' + data.skills.length + ')' : ''
        ),
        open && React.createElement('div', { className: 'skhub_panel' },
          error && React.createElement('div', { className: 'skhub_note' }, '加载失败: ' + error),
          React.createElement('input', {
            className: 'skhub_search',
            placeholder: '搜索技能…（如 72-daoyuan）',
            value: query,
            onChange: (e) => setQuery(e.target.value),
          }),
          React.createElement('div', { className: 'skhub_list' },
            (data === null ? [] : data.skills)
              .filter((s) => !query || s.dir.toLowerCase().includes(query.toLowerCase()) || (s.name || '').toLowerCase().includes(query.toLowerCase()) || (s.description || '').toLowerCase().includes(query.toLowerCase()))
              .slice(0, 40)
              .map((s) => React.createElement('div', { key: s.dir, className: 'skhub_item', onClick: () => pick(s) },
                React.createElement('div', { className: 'skhub_itemName' },
                  React.createElement('span', null, s.name || s.dir),
                  (s.libs || []).map((l) => React.createElement('span', { key: l, className: 'skhub_badge' }, l))
                ),
                s.description && React.createElement('div', { className: 'skhub_itemDesc' }, s.description)
              ))
          ),
          data && React.createElement('div', { className: 'skhub_note' }, '共 ' + data.skills.length + ' 个技能 · 点击将使用指令填入输入框')
        )
      )
    }

    slots.inject('conversation.input.dock', () => slots.register(
      { name: 'conversation.input.dock', id: 'skill-hub', order: 30 },
      (props) => React.createElement(SkillStrip, { inputActions: props.inputActions }),
    ))
  },
}
