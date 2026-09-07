/**
 * dsh-composer-attachments — host half.
 *
 * Registers one HTTP route (POST /composer-attachments/api/save) that writes
 * uploaded non-image attachments into the current session workspace under
 * `.dsh-uploads/<yyyy-MM-dd>/`, returning workspace-relative '/'-separated
 * paths for `@` references in the composer draft.
 *
 * Binary write path: base64 arrives over JSON, is piped to PowerShell stdin,
 * written to a temp .b64 file, decoded with certutil, then the temp file is
 * removed. certutil + cmdlets only, so the decode also works under
 * ConstrainedLanguage policy.
 */
export const name = 'dsh-composer-attachments'
export const inject = ['webServer', 'shell']

function sanitize(name) {
  var n = String(name || 'file').split(/[\\/]/).pop()
  n = n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^[\s.]+/, '').trim()
  if (!n) n = 'file'
  if (n.length > 80) {
    var dot = n.lastIndexOf('.')
    var ext = dot > 0 ? n.slice(dot) : ''
    n = n.slice(0, 80 - ext.length) + ext
  }
  return n
}

function isAbs(p) {
  return /^[A-Za-z]:[\\/]/.test(p) || p.indexOf('\\\\') === 0 || p.charAt(0) === '/'
}

function writeJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = []
    var size = 0
    req.on('data', function (chunk) {
      size += chunk.length
      if (size > 160 * 1024 * 1024) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', function () {
      try {
        var text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch (error) {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

async function saveFiles(ctx, payload) {
  var data = payload || {}
  var files = Array.isArray(data.files) ? data.files : []
  if (!files.length) return { paths: [], error: 'no-files' }
  var total = 0
  for (var i = 0; i < files.length; i++) total += files[i] && files[i].b64 ? files[i].b64.length : 0
  if (total > 96 * 1024 * 1024) return { paths: [], error: '附件批次过大（上限约 64MB）' }

  var cwd = typeof data.cwd === 'string' && data.cwd && isAbs(data.cwd) ? data.cwd : undefined
  if (!cwd) {
    try {
      var sessions = ctx.get('sessions')
      var session = data.sessionId && sessions ? sessions.get(data.sessionId) : undefined
      cwd = session && session.header && session.header.cwd ? session.header.cwd : undefined
    } catch (eS) {}
  }
  if (!cwd) return { paths: [], error: '无法定位当前会话的工作区' }

  var shell = ctx.get('shell')
  if (!shell || typeof shell.resolve !== 'function' || typeof shell.run !== 'function') {
    return { paths: [], error: 'shell 服务不可用' }
  }

  var q = function (s) { return String(s).replace(/'/g, "''") }
  var now = new Date()
  var p2 = function (n) { return String(n).length < 2 ? '0' + n : String(n) }
  var day = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate())
  var stamp = p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds()) + '-' + Math.random().toString(36).slice(2, 6)
  var sep = cwd.indexOf('\\') >= 0 ? '\\' : '/'
  var dir = cwd + sep + '.dsh-uploads' + sep + day
  var relDir = '.dsh-uploads/' + day

  var out = []
  for (var i = 0; i < files.length; i++) {
    var f = files[i]
    var safe = sanitize(f && f.name)
    var name = stamp + '-' + (i + 1) + '-' + safe
    var outPath = dir + sep + name
    var tmpPath = dir + sep + '~' + stamp + '-' + (i + 1) + '.b64'
    var cmd = "$ErrorActionPreference='Stop'; "
      + "New-Item -ItemType Directory -Force -Path '" + q(dir) + "' | Out-Null; "
      + "$b=[Console]::In.ReadToEnd(); "
      + "Set-Content -LiteralPath '" + q(tmpPath) + "' -Value $b.Trim() -NoNewline -Encoding Ascii; "
      + "certutil -f -decode '" + q(tmpPath) + "' '" + q(outPath) + "' | Out-Null; "
      + "Remove-Item -LiteralPath '" + q(tmpPath) + "' -Force; "
      + "Write-Output ('OK ' + (Get-Item -LiteralPath '" + q(outPath) + "').Length)"
    try {
      var spec = shell.resolve({ command: cmd, timeoutMs: 180000, stdoutMaxBytes: 8192, stdin: f.b64 || '' })
      var res = await shell.run(spec)
      var text = res && res.stdout ? (typeof res.stdout.text === 'string' ? res.stdout.text : String(res.stdout)) : ''
      if (res && res.exitCode === 0 && text.indexOf('OK') >= 0) {
        out.push({ name: safe, path: relDir + '/' + name })
      } else {
        out.push({ name: safe, error: '写入失败（exit ' + (res ? res.exitCode : '?') + '）' })
      }
    } catch (err) {
      out.push({ name: safe, error: err && err.message ? err.message : String(err) })
    }
  }
  return { paths: out }
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/composer-attachments/api',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'POST only' } })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/composer-attachments/api/')
        ? pathname.slice('/composer-attachments/api/'.length)
        : undefined
      if (method !== 'save') {
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown method' } })
        return
      }
      try {
        const payload = await readJsonBody(req)
        const value = await saveFiles(ctx, payload)
        if (value.error) writeJson(res, 200, { ok: false, error: { code: 'save-failed', message: value.error } })
        else writeJson(res, 200, { ok: true, value })
      } catch (error) {
        writeJson(res, 200, { ok: false, error: { code: 'save-failed', message: String((error && error.message) || error) } })
      }
    }
  }), 'dsh-composer-attachments: api route')
}
