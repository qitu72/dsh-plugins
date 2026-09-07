// dsh-composer-attachments — client half.
// Registers: (1) 📋 / 📎 buttons in the composer tool row (conversation.input.left),
// (2) a CodeBuddy-style file chip rail above the composer card
// (conversation.input.dock — one pill per uploaded non-image attachment,
// the × button strips the reference line from the draft),
// (3) body-level toasts (auto-dismiss, never block the composer),
// (4) a document-level paste interceptor that routes clipboard files — images
// through the native draft-image rail, other files through the upload API —
// while leaving plain-text pastes untouched.
window.__ModuleLoader__.load({
  id: 'dsh-composer-attachments',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var IMAGE_TYPES = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1, 'image/gif': 1 }
    // Windows 剪贴板有时把截图送成 type 为空的 File（只有 DIB 位图），按魔数识别真实图片类型
    function sniffImageType(bytes) {
      if (!bytes || bytes.length < 12) return ''
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
      if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
      if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
      return ''
    }
    async function upgradeUntypedImage(file) {
      if (!file || file.type || file.size <= 0) return file
      try {
        var head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
        var t = sniffImageType(head)
        if (!t) return file
        var ext = t === 'image/jpeg' ? 'jpg' : String(t).split('/')[1] || 'png'
        return new File([file], 'clipboard.' + ext, { type: t })
      } catch (e) { return file }
    }
    var MAX_BATCH_BYTES = 64 * 1024 * 1024
    var TITLE = '添加附件（图片 / 文档 / 视频 / 音频）\n小贴士：复制的图片可直接 Ctrl+V 粘贴'
    var REF_PREFIX = '📎 @'

    var CSS = ''
      + '.dsh-ap-wrap{display:inline-flex;align-items:center}'
      + '.dsh-ap-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:none;background:transparent;border-radius:8px;color:var(--dsw-alias-label-secondary,#8a8f98);cursor:pointer;padding:0;transition:background .15s ease,color .15s ease}'
      + '.dsh-ap-btn:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#8a8f98) 14%,transparent);color:var(--dsw-alias-label-primary,#e7e9ec)}'
      + '.dsh-ap-btn:disabled{opacity:.45;cursor:default;background:transparent}'
      + '.dsh-ap-spin{animation:dsh-ap-rot .9s linear infinite}'
      + '@keyframes dsh-ap-rot{to{transform:rotate(360deg)}}'
      // file chip rail (conversation.input.dock, sits right above the composer card)
      + '.dsh-ap-chips{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 12px 0}'
      + '.dsh-ap-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 6px 0 10px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-label-secondary,#8a8f98) 10%,transparent);border:.5px solid color-mix(in srgb,var(--dsw-alias-label-secondary,#8a8f98) 20%,transparent);font-size:12px;max-width:280px;transition:background .15s ease}'
      + '.dsh-ap-chip:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#8a8f98) 15%,transparent)}'
      + '.dsh-ap-chip-icon{display:inline-flex}'
      + '.dsh-ap-chip-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#e7e9ec)}'
      + '.dsh-ap-chip-x{display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#8a8f98);font-size:13px;line-height:1;cursor:pointer;opacity:.6;padding:0;transition:opacity .12s ease,background .12s ease}'
      + '.dsh-ap-chip-x:hover{opacity:1;background:color-mix(in srgb,var(--dsw-alias-label-secondary,#8a8f98) 18%,transparent)}'
      // body-level toasts
      + '.dsh-ap-toasts{position:fixed;top:64px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;z-index:1200;pointer-events:none}'
      + '.dsh-ap-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:8px;max-width:460px;padding:8px 12px;border-radius:10px;font-size:12.5px;line-height:1.5;background:var(--dsw-specific-input-major,#fff);color:var(--dsw-alias-label-primary,#1f2328);border:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));box-shadow:0 10px 30px rgba(0,0,0,.14);opacity:0;transform:translateY(-8px);transition:opacity .18s ease,transform .18s ease}'
      + '.dsh-ap-toast.dsh-ap-in{opacity:1;transform:translateY(0)}'
      + '.dsh-ap-toast.dsh-ap-out{opacity:0;transform:translateY(-8px)}'
      + '.dsh-ap-toast::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;margin-top:5px;background:var(--dsw-alias-label-tertiary,#8a8f98)}'
      + '.dsh-ap-toast.dsh-ap-error::before{background:var(--dsw-alias-state-error-primary,#e5484d)}'
      + '.dsh-ap-toast.dsh-ap-success::before{background:#46a758}'
      + '.dsh-ap-toast-text{word-break:break-all}'
      + '.dsh-ap-toast-x{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#8a8f98);font-size:13px;line-height:1;cursor:pointer;padding:0}'
      + '.dsh-ap-toast-x:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#8a8f98) 18%,transparent)}'

    var B64T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    function toBase64(bytes) {
      var parts = []
      var buf = ''
      var len = bytes.length
      for (var i = 0; i < len; i += 3) {
        var b1 = bytes[i]
        var b2 = i + 1 < len ? bytes[i + 1] : -1
        var b3 = i + 2 < len ? bytes[i + 2] : -1
        buf += B64T[b1 >> 2]
        buf += B64T[((b1 & 3) << 4) | (b2 < 0 ? 0 : (b2 >> 4))]
        buf += b2 < 0 ? '=' : B64T[((b2 & 15) << 2) | (b3 < 0 ? 0 : (b3 >> 6))]
        buf += b3 < 0 ? '=' : B64T[b3 & 63]
        if (buf.length > 32768) { parts.push(buf); buf = '' }
      }
      if (buf) parts.push(buf)
      return parts.join('')
    }

    function fmtSize(n) {
      var mb = n / (1024 * 1024)
      return (Number.isInteger(mb) ? String(mb) : mb.toFixed(1)) + 'MB'
    }

    async function callSave(payload) {
      var response = await fetch('/composer-attachments/api/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
      var parsed = await response.json().catch(function () { return null })
      if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === undefined) {
        throw new Error((parsed && parsed.error && parsed.error.message) || ('HTTP ' + response.status))
      }
      return parsed.value
    }

    // ===== body-level toasts (never block the composer; auto-dismiss) =====
    var Toast = {
      host: null,
      max: 4,
      ensure: function () {
        if (this.host && document.body.contains(this.host)) return this.host
        var h = document.createElement('div')
        h.className = 'dsh-ap-toasts'
        document.body.appendChild(h)
        this.host = h
        return h
      },
      dismiss: function (el) {
        if (!el || el.__dshApOut) return
        el.__dshApOut = true
        el.classList.remove('dsh-ap-in')
        el.classList.add('dsh-ap-out')
        setTimeout(function () { try { el.remove() } catch (e) {} }, 220)
      },
      show: function (level, text, ms) {
        var self = this
        var h = this.ensure()
        while (h.children.length >= this.max) { this.dismiss(h.firstElementChild) }
        var el = document.createElement('div')
        el.className = 'dsh-ap-toast dsh-ap-' + (level || 'info')
        var tx = document.createElement('span')
        tx.className = 'dsh-ap-toast-text'
        tx.textContent = text
        el.appendChild(tx)
        if (level === 'error') {
          var x = document.createElement('button')
          x.type = 'button'
          x.className = 'dsh-ap-toast-x'
          x.textContent = '×'
          x.title = '关闭'
          x.addEventListener('click', function () { self.dismiss(el) })
          el.appendChild(x)
        }
        h.appendChild(el)
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { el.classList.add('dsh-ap-in') })
        })
        setTimeout(function () { self.dismiss(el) }, ms || (level === 'error' ? 6500 : 2800))
        return el
      }
    }

    // ===== file chip store: uploaded non-image attachments shown as pills =====
    // Source of truth for visibility is the draft text: a chip renders only
    // while its `📎 @path` reference line exists in the composer draft, so
    // chips clear themselves on send / manual edit / session switch.
    var ChipStore = {
      order: [],
      byPath: Object.create(null),
      subs: [],
      subscribe: function (fn) { this.subs.push(fn); var self = this; return function () { self.subs = self.subs.filter(function (f) { return f !== fn }) } },
      emit: function () { for (var i = 0; i < this.subs.length; i++) { try { this.subs[i]() } catch (e) {} } },
      add: function (items) {
        var changed = false
        for (var i = 0; i < items.length; i++) {
          var it = items[i]
          if (!it || !it.path) continue
          if (this.byPath[it.path]) this.order = this.order.filter(function (p) { return p !== it.path })
          else changed = true
          this.byPath[it.path] = { path: it.path, name: it.name || String(it.path).split('/').pop() }
          this.order.push(it.path)
        }
        while (this.order.length > 40) {
          var old = this.order.shift()
          delete this.byPath[old]
        }
        if (changed) this.emit()
      },
      snapshot: function () {
        var out = []
        for (var i = 0; i < this.order.length; i++) {
          var c = this.byPath[this.order[i]]
          if (c) out.push(c)
        }
        return out
      }
    }

    var EXT_COLORS = {
      pdf: '#e5484d', doc: '#3b82f6', docx: '#3b82f6', odt: '#3b82f6',
      xls: '#22c55e', xlsx: '#22c55e', csv: '#22c55e',
      ppt: '#f97316', pptx: '#f97316',
      zip: '#f59e0b', rar: '#f59e0b', '7z': '#f59e0b', tar: '#f59e0b', gz: '#f59e0b',
      mp4: '#a855f7', mov: '#a855f7', mkv: '#a855f7', avi: '#a855f7', webm: '#a855f7',
      mp3: '#ec4899', wav: '#ec4899', flac: '#ec4899', m4a: '#ec4899', ogg: '#ec4899',
      md: '#0ea5e9', json: '#0ea5e9', py: '#0ea5e9', js: '#0ea5e9', ts: '#0ea5e9',
      tsx: '#0ea5e9', jsx: '#0ea5e9', html: '#0ea5e9', css: '#0ea5e9',
      txt: '#8a8f98', log: '#8a8f98'
    }
    function extColor(name) {
      var m = /\.([a-z0-9]+)$/i.exec(name || '')
      return m ? (EXT_COLORS[m[1].toLowerCase()] || '#8a8f98') : '#8a8f98'
    }

    function fileIcon(name) {
      return React.createElement('span', { className: 'dsh-ap-chip-icon', style: { color: extColor(name) } },
        React.createElement('svg', {
          width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
        },
          React.createElement('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
          React.createElement('polyline', { points: '14 2 14 8 20 8' }),
          React.createElement('line', { x1: 16, y1: 13, x2: 8, y2: 13 }),
          React.createElement('line', { x1: 16, y1: 17, x2: 8, y2: 17 })
        )
      )
    }

    function FileChips(props) {
      var st = React.useState(0)
      var bump = st[1]
      React.useEffect(function () {
        var unsub = ChipStore.subscribe(function () { bump(function (v) { return v + 1 }) })
        // safety net: re-check draft periodically so chips clear on send even
        // if the slot machinery memoises entry re-renders
        var timer = setInterval(function () { bump(function (v) { return v + 1 }) }, 800)
        return function () { unsub(); clearInterval(timer) }
      }, [])

      var input = props.input
      var draft = input && typeof input.draft === 'string' ? input.draft : ''
      var setDraft = props.inputActions && props.inputActions.setDraft

      var latest = React.useRef({})
      latest.current = { draft: draft, setDraft: setDraft }

      function remove(path) {
        var cur = latest.current
        if (!cur.setDraft) return
        var line = REF_PREFIX + path
        var lines = cur.draft.split('\n').filter(function (l) { return l.trim() !== line })
        var next = lines.join('\n').replace(/\n{3,}/g, '\n\n')
        cur.setDraft(next)
      }

      var items = ChipStore.snapshot().filter(function (c) {
        return draft.indexOf(REF_PREFIX + c.path) !== -1
      })
      if (!items.length) return null

      return React.createElement('div', { className: 'dsh-ap-chips' },
        items.map(function (c) {
          return React.createElement('span', {
            key: c.path, className: 'dsh-ap-chip',
            title: '已添加到草稿：' + REF_PREFIX + c.path + (setDraft ? '\n点击 × 可从输入框移除' : '')
          },
            fileIcon(c.name),
            React.createElement('span', { className: 'dsh-ap-chip-name' }, c.name),
            setDraft ? React.createElement('button', {
              type: 'button', className: 'dsh-ap-chip-x', 'aria-label': '移除附件',
              onClick: function () { remove(c.path) }
            }, '×') : null
          )
        })
      )
    }

    var ICON = React.createElement('svg', {
      width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
    }, React.createElement('path', { d: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' }))
    var SPIN = React.createElement('svg', {
      className: 'dsh-ap-spin', width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round'
    }, React.createElement('path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' }))
    var CLIP = React.createElement('svg', {
      width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
    }, React.createElement('rect', { x: 8, y: 2, width: 8, height: 4, rx: 1 }), React.createElement('path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }))

    function AttachButton(props) {
      var inputActions = props.inputActions
      var useInput = props.useInput
      var useProjection = props.useProjection
      var useSessions = props.useSessions

      var input = useInput ? useInput((s) => s) : null
      var limits = useProjection ? useProjection('imageLimits') : undefined
      var cwd = undefined
      if (useSessions) {
        try {
          var list = useSessions((s) => s)
          if (list && list.byId && props.sessionId && list.byId[props.sessionId]) cwd = list.byId[props.sessionId].cwd
        } catch (e0) {}
      }

      var latest = React.useRef({})
      latest.current = { input: input, limits: limits, sessionId: props.sessionId, cwd: cwd }

      var busyState = React.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var busyRef = React.useRef(false)
      var fileRef = React.useRef(null)

      function notifyErr(text) { Toast.show('error', text) }

      function addNativeImages(files, fromPaste) {
        var conv = ctxRef.current
        if (!conv || typeof conv.createDraftImages !== 'function') { notifyErr('附件组件不可用'); return }
        try {
          var cur = latest.current
          var lim = cur.limits
          if (lim && conv.draftImages) {
            var existing = conv.draftImages((cur.input && cur.input.imageIds) || [])
            var totalBytes = 0
            for (var i = 0; i < existing.length; i++) totalBytes += existing[i].file ? existing[i].file.size : 0
            var addBytes = 0
            for (var j = 0; j < files.length; j++) addBytes += files[j].size
            if (existing.length + files.length > lim.maxImagesPerMessage) { notifyErr('一条消息最多 ' + lim.maxImagesPerMessage + ' 张图片'); return }
            for (var k = 0; k < files.length; k++) {
              if (files[k].size > lim.maxImageBytes) { notifyErr('单张图片不能超过 ' + fmtSize(lim.maxImageBytes)); return }
            }
            if (lim.maxMessageImageBytes && totalBytes + addBytes > lim.maxMessageImageBytes) { notifyErr('图片总大小超出上限 ' + fmtSize(lim.maxMessageImageBytes)); return }
          }
          var created = conv.createDraftImages(files)
          var ids = []
          for (var m = 0; m < created.length; m++) ids.push(created[m].id)
          var ok = inputActions ? inputActions.addImages(ids) : false
          if (!ok) {
            for (var n = 0; n < created.length; n++) { try { conv.releaseDraftImage(created[n].id) } catch (e) {} }
            notifyErr('当前状态不能添加图片')
            return
          }
          if (fromPaste) Toast.show('success', ids.length === 1 ? '已贴入 1 张图片' : '已贴入 ' + ids.length + ' 张图片')
        } catch (err) {
          notifyErr('图片添加失败：' + (err && err.message ? err.message : String(err)))
        }
      }

      async function uploadAndReference(files, pasteText) {
        if (busyRef.current) { notifyErr('正在上传上一批文件，请稍候'); return }
        busyRef.current = true
        setBusy(true)
        try {
          var cur = latest.current
          var total = 0
          for (var i = 0; i < files.length; i++) total += files[i].size
          if (total > MAX_BATCH_BYTES) { notifyErr('非图片附件单批总大小不能超过 64MB'); return }
          var payload = []
          for (var j = 0; j < files.length; j++) {
            var bytes = new Uint8Array(await files[j].arrayBuffer())
            payload.push({ name: files[j].name || 'file', b64: toBase64(bytes) })
          }
          var res = await callSave({ sessionId: cur.sessionId, cwd: cur.cwd || undefined, files: payload })
          var paths = res && Array.isArray(res.paths) ? res.paths : []
          var ok = []
          var failed = []
          for (var p = 0; p < paths.length; p++) (paths[p] && paths[p].path ? ok : failed).push(paths[p])
          if (!ok.length && !failed.length && res && res.error) throw new Error(res.error)
          if (ok.length) {
            var draft = (cur.input && cur.input.draft) || ''
            var base = draft.replace(/\s+$/, '')
            var block = ok.map(function (item) { return REF_PREFIX + item.path }).join('\n')
            var next = (base ? base + '\n\n' : '') + (pasteText ? pasteText.trim() + '\n\n' : '') + block + '\n'
            if (inputActions) inputActions.setDraft(next)
            // chips render only while the draft actually contains the
            // reference line, so a failed setDraft simply shows no chips
            ChipStore.add(ok)
          }
          if (failed.length) {
            var msgs = []
            for (var f = 0; f < failed.length; f++) msgs.push((failed[f].name || '文件') + '：' + (failed[f].error || '失败'))
            notifyErr('部分附件上传失败：' + msgs.join('；'))
          }
        } catch (err) {
          notifyErr('附件上传失败：' + (err && err.message ? err.message : String(err)))
        } finally {
          busyRef.current = false
          setBusy(false)
        }
      }

      async function pasteFromClipboard() {
        try {
          if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
            notifyErr('此浏览器不支持剪贴板读取，请改用 Ctrl+V 粘贴')
            return
          }
          var items = await navigator.clipboard.read()
          var files = []
          for (var i = 0; i < items.length; i++) {
            var types = items[i].types || []
            for (var j = 0; j < types.length; j++) {
              if (IMAGE_TYPES[types[j]]) {
                var blob = await items[i].getType(types[j])
                files.push(new File([blob], 'clipboard.' + (types[j] === 'image/jpeg' ? 'jpg' : types[j].split('/')[1] || 'png'), { type: types[j] }))
              }
            }
          }
          if (!files.length) { Toast.show('info', '剪贴板里没有图片（可能只有文本）'); return }
          addNativeImages(files)
        } catch (err) {
          notifyErr('读取剪贴板失败：' + (err && err.message ? err.message : String(err)) + '（如浏览器询问请允许剪贴板权限）')
        }
      }

      async function handleFiles(allFiles, pasteText) {
        var upgraded = []
        for (var w = 0; w < allFiles.length; w++) upgraded.push(await upgradeUntypedImage(allFiles[w]))
        var images = []
        var others = []
        for (var i = 0; i < upgraded.length; i++) {
          if (IMAGE_TYPES[upgraded[i].type]) images.push(upgraded[i]); else others.push(upgraded[i])
        }
        if (images.length) addNativeImages(images, true)
        if (others.length) {
          uploadAndReference(others, pasteText || '')
        } else if (pasteText && pasteText.trim() && images.length && inputActions) {
          var cur = latest.current.input
          var base = ((cur && cur.draft) || '').replace(/\s+$/, '')
          inputActions.setDraft((base ? base + '\n\n' : '') + pasteText.trim() + '\n')
        }
      }

      function tryHtmlImage(cd) {
        var html = ''
        try { html = cd.getData('text/html') || '' } catch (e) { return false }
        if (!html) return false
        var m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
        if (!m) return false
        var src = m[1]
        if (!/^(data:image\/|blob:|https?:)/i.test(src)) return false
        Toast.show('info', '粘贴含网页图片引用，正在读取…')
        fetch(src).then(function (r) { return r.blob() }).then(function (b) {
          if (!b || IMAGE_TYPES[b.type] === undefined) { notifyErr('网页图片读取失败或类型不支持：' + (b && b.type)); return }
          var f = new File([b], 'pasted-image.' + (b.type === 'image/jpeg' ? 'jpg' : b.type.split('/')[1] || 'png'), { type: b.type })
          handleFiles([f], '')
        }).catch(function (e2) { notifyErr('网页图片读取失败：' + (e2 && e2.message ? e2.message : String(e2))) })
        return true
      }

      React.useEffect(function () {
        function onPaste(e) {
          try {
            // Take over file/image pastes anywhere: the composer contenteditable,
            // plain inputs, even document.body — screenshot tools steal focus, so
            // the user often hits Ctrl+V while the editor is NOT focused. Plain
            // text pastes are always left untouched for the editor to handle.
            var cd = e.clipboardData
            if (!cd) return
            var files = cd.files ? Array.prototype.slice.call(cd.files) : []
            files = files.filter(function (f) { return f && (f.size > 0 || f.type) })
            var text = ''
            try { text = cd.getData('text/plain') || '' } catch (e2) {}
            if (files.length) {
              e.preventDefault()
              e.stopPropagation()
              try {
                var imgBytes = 0
                for (var im = 0; im < files.length; im++) { if (IMAGE_TYPES[files[im].type]) imgBytes += files[im].size }
                window.__dshApLastPaste = { at: Date.now(), bytes: imgBytes }
              } catch (eM) {}
              handleFiles(files, text).catch(function () {})
              return
            }
            if (!text && cd.types && Array.prototype.indexOf.call(cd.types, 'text/html') !== -1) {
              if (tryHtmlImage(cd)) {
                e.preventDefault()
                e.stopPropagation()
              }
            }
          } catch (err) {
            try { Toast.show('error', '粘贴处理失败：' + (err && err.message ? err.message : String(err))) } catch (e3) {}
            console.error(err)
          }
        }
        document.addEventListener('paste', onPaste, true)
        return function () { document.removeEventListener('paste', onPaste, true) }
      }, [])

      // Ctrl+V 兜底：部分桌面环境里 paste 事件收不到剪贴板文件（截图后焦点漂移 / Electron 差异）。
      // keydown 阶段直接读系统剪贴板；读到图片就走同一条贴图通道，读不到/被拒绝则放行原生 paste，
      // 文本粘贴完全不受影响。用 __dshApLastPaste 与原生 paste 事件去重，防止双份。
      React.useEffect(function () {
        function onKeydown(e) {
          try {
            if (!(e.ctrlKey === true || e.metaKey === true) || e.shiftKey === true || e.altKey === true) return
            if (String(e.key || '').toLowerCase() !== 'v') return
            if (busyRef.current) return
            if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') return
            var pending = null
            try { pending = navigator.clipboard.read() } catch (errSync) { return }
            if (!pending || typeof pending.then !== 'function') return
            pending.then(function (items) {
              var files = []
              var chain = Promise.resolve()
              for (var i = 0; i < items.length; i++) {
                var types = items[i] && items[i].types ? items[i].types : []
                for (var j = 0; j < types.length; j++) {
                  (function (item, t) {
                    if (!IMAGE_TYPES[t]) return
                    chain = chain.then(function () {
                      return item.getType(t).then(function (blob) {
                        files.push(new File([blob], 'clipboard.' + (t === 'image/jpeg' ? 'jpg' : String(t).split('/')[1] || 'png'), { type: t }))
                      })
                    }).catch(function () {})
                  })(items[i], types[j])
                }
              }
              chain.then(function () {
                try {
                  if (!files.length) return
                  var total = 0
                  for (var n = 0; n < files.length; n++) total += files[n].size
                  var mark = window.__dshApLastPaste
                  if (mark && Date.now() - mark.at < 800 && mark.bytes === total) return
                  window.__dshApLastPaste = { at: Date.now(), bytes: total }
                  handleFiles(files, '').catch(function () {})
                } catch (eH) {}
              })
            }).catch(function () {})
          } catch (err) {}
        }
        document.addEventListener('keydown', onKeydown, true)
        return function () { document.removeEventListener('keydown', onKeydown, true) }
      }, [])

      if (!inputActions) return null
      return React.createElement('div', { className: 'dsh-ap-wrap' },
        React.createElement('button', {
          type: 'button', className: 'dsh-ap-btn', title: '一键贴图：直接读取剪贴板里的截图\n（Ctrl+V 不生效时用这个）',
          'aria-label': '贴入剪贴板图片', disabled: busy,
          onClick: pasteFromClipboard
        }, CLIP),
        React.createElement('button', {
          type: 'button', className: 'dsh-ap-btn', title: TITLE,
          'aria-label': '添加附件', disabled: busy,
          onClick: function () { if (fileRef.current) fileRef.current.click() }
        }, busy ? SPIN : ICON),
        React.createElement('input', {
          ref: fileRef, type: 'file', multiple: true, style: { display: 'none' },
          onChange: function (e) {
            var fs = Array.prototype.slice.call(e.target.files || [])
            e.target.value = ''
            if (fs.length) handleFiles(fs, '')
          }
        })
      )
    }

    var ctxRef = { current: undefined }

    exports.inject = ['slots', 'conversation']
    exports.apply = function (ctx) {
      ctxRef.current = ctx.get('conversation')
      try {
        var style = document.createElement('style')
        style.id = 'dsh-composer-attachments-css'
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(function () {
          return function () { try { style.remove() } catch (e) {} }
        })
      } catch (e) {}
      var disposers = []
      disposers.push(ctx.slots.inject('conversation.input.left', function () {
        return ctx.slots.register(
          { name: 'conversation.input.left', id: 'attachment-plus', order: 0, label: '添加附件' },
          function (props) { return React.createElement(AttachButton, props) }
        )
      }))
      disposers.push(ctx.slots.inject('conversation.input.dock', function () {
        return ctx.slots.register(
          { name: 'conversation.input.dock', id: 'composer-attachment-files', order: 90, locale: 'dsh-composer-attachments' },
          function (props) { return React.createElement(FileChips, props) }
        )
      }))
      ctx.effect(function () {
        return function () {
          for (var i = 0; i < disposers.length; i++) { try { disposers[i]() } catch (e) {} }
          try { if (Toast.host) { Toast.host.remove(); Toast.host = null } } catch (e) {}
        }
      })
    }

    return module.exports
  }
})
