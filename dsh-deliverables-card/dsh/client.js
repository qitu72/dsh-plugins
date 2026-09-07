// Client half of dsh-deliverables-card:
// 1) register an HTML file viewer that opens in a new browser tab.
// 2) register a "write" tool-view card so produced files render as cards.
window.__ModuleLoader__.load({
  id: 'dsh-deliverables-card',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    exports.inject = ['slots', 'betterSidebar']

    exports.apply = function (ctx) {
      var disposers = []
      disposers.push(ctx.slots.inject('tool.call.toolview', function () {
        return ctx.slots.register({ name: 'tool.call.toolview', key: 'write', priority: -1 }, function (props) {
          return React.createElement(WriteCard, props)
        })
      }))
      disposers.push(ctx.betterSidebar.registerFileViewer({
        id: 'html-open-tab',
        title: 'HTML 新标签页打开',
        exts: ['html', 'htm'],
        priority: 100,
        fetchStrategy: 'none',
        component: HtmlOpenTab
      }))
      ctx.effect(function () {
        return function () {
          disposers.forEach(function (d) { try { d() } catch (e) {} })
        }
      })
    }

    function HtmlOpenTab(p) {
      var url = p.mediaUrl || ('/sidebar/file?sessionId=' + encodeURIComponent(p.scope.sessionId) + '&path=' + encodeURIComponent(p.path))
      React.useEffect(function () { try { window.open(url, '_blank') } catch (e) {} }, [])
      return React.createElement('div', { style: { padding: '16px' } },
        React.createElement('p', null, 'HTML 已在浏览器新标签页打开'),
        React.createElement('a', { href: url, target: '_blank', rel: 'noopener', style: { color: '#4a90d9' } }, '若未打开，点这里')
      )
    }

    function WriteCard(props) {
      var block = props.block
      var argsRaw = null
      if (block && typeof block.argsRaw === 'string') argsRaw = block.argsRaw
      else if (block && block.call && typeof block.call.argsRaw === 'string') argsRaw = block.call.argsRaw
      var path = ''
      if (argsRaw) { try { var a = JSON.parse(argsRaw); path = a.file_path || a.filePath || a.path || '' } catch (e) {} }
      if (!path) return null
      var name = String(path).split(/[\\/]/).pop() || path
      var ext = (String(name).split('.').pop() || '').toLowerCase()
      var icons = { html: '🌐', htm: '🌐', md: '📝', markdown: '📝', json: '🧾', csv: '📊', pdf: '📕', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', xlsx: '📗', xls: '📗', docx: '📘', pptx: '📙', txt: '📄' }
      var icon = icons[ext] || '📄'
      var isHtml = ext === 'html' || ext === 'htm'
      var open = function () {
        if (isHtml) {
          var sid = props.sessionId || ''
          try { window.open('/sidebar/file?sessionId=' + encodeURIComponent(sid) + '&path=' + encodeURIComponent(path), '_blank') } catch (e) {}
        } else {
          try { props.openFile(path) } catch (e) {}
        }
      }
      return React.createElement('div', { style: { display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', margin: '4px 0', maxWidth: '100%' } },
        React.createElement('span', { style: { fontSize: '18px' } }, icon),
        React.createElement('div', { style: { minWidth: 0 } },
          React.createElement('div', { style: { fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, name),
          React.createElement('div', { style: { fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, String(path))
        ),
        React.createElement('button', { onClick: open, style: { padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' } }, isHtml ? '新标签页打开' : '打开')
      )
    }

    return module.exports
  }
})
