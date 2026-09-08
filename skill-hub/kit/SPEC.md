# skill-hub 规范与经验手册（SPEC）

> 本文件是 skill-hub 插件的「规范 + 踩坑 + 恢复 SOP」合集，配合 `kit/` 使用。
> 目的：让本插件能复用到其他类 DeepSeek Harness 的产品，以及在再次出错时快速布置/修复。

---

## 1. 设计概述

skill-hub 是一个 **DSh（DeepSeek Harness）Web 插件**，用途：在对话输入框旁加一个「🧩 技能」按钮，
点开列出三端（AutoClaw / CodeBuddy / WorkBuddy）的技能库，搜索后把 `@技能名` 填入输入框。

**为什么不用内置 `host.listDirectory` RPC？**
内置的目录列举被 `browse` 能力门控，本地 loopback 桌面上该选择器解析为 `native`
（系统文件选择对话框），永远返回 `directory-picker-unavailable`。因此 host 端直接读 Node `fs`，
通过自定义 `webServer` 同源路由 `/api/skill-hub/list` 暴露 JSON，浏览器端 `fetch` 即可。

**架构（Cordis 插件，host/client 两半）：**
- **host 半**（`src/index.js`）：`export function apply(ctx)`，向 `ctx.webServer` 注册路由，扫描技能目录。
- **client 半**（`src/client/index.js`）：注入按钮到 `conversation.input.left` 插槽，React 手写（无 JSX），
  拉取 host 路由，渲染带搜索框的弹窗，支持点击外部关闭。

**插件管理功能（2026-08-16 新增）：**
面板现为双 tab：「技能」+「插件」。插件 tab 让用户在 UI 上启用/禁用已装插件，无需手改 `package.json`。
- **host 端 3 个 API**：
  - `GET /api/skill-hub/plugins` — 读 `profiles/<name>/package.json`，返回 `{ installed: [{name, version, description, enabled}], enabledCount, totalCount }`。`enabled` = 是否在 `dsh.profile.bundles` 数组里。
  - `POST /api/skill-hub/plugins/toggle` — body `{name, enable}`，改 `bundles` 数组并写回 `package.json`，返回 `{changed, restartRequired}`。
  - `POST /api/skill-hub/restart` — 响应后延迟 300ms `process.exit(0)`，让外部守护/用户重启 dsh。
- **client 端 UI**：tab bar 切换、搜索框共用、每插件一行（名称@版本 + 简介 + 启用/禁用开关）、切换后顶部蓝色提示条"需重启生效" + "重启并刷新"按钮。
- **限制**：dsh boot 机制决定了 `bundles` 只在启动时加载一次，切换后**必须重启 dsh** 才生效（无法绕过）。

---

## 2. 文件清单（绝对路径）

### 2.1 本 kit（可直接复制分发）
- `D:\aolong\repos\skill-hub\kit\src\index.js` —— host 源码（含 `resolveRoots` 可移植目录解析）
- `D:\aolong\repos\skill-hub\kit\src\client\index.js` —— client 源码（按钮/弹窗/搜索/外部关闭）
- `D:\aolong\repos\skill-hub\kit\src\build.mjs` —— esbuild 构建脚本（产出 `lib/`）
- `D:\aolong\repos\skill-hub\kit\src\dsh.plugin.json` —— 插件清单（声明 entry + client.web）
- `D:\aolong\repos\skill-hub\kit\src\package.json` —— 含 `build` 脚本与 esbuild 依赖
- `D:\aolong\repos\skill-hub\kit\src\cordis.patch.yml` —— 插件挂载点映射
- `D:\aolong\repos\skill-hub\kit\lib\index.js`, `client.js`, `*.map` —— **预编译产物（已验证可用，部署即用）**
- `D:\aolong\repos\skill-hub\kit\legacy\host.js`, `client.js` —— cordis_define 内存注入版（无需构建的兜底方案）
- `D:\aolong\repos\skill-hub\kit\deploy.ps1` —— 一键部署/修复脚本
- `D:\aolong\repos\skill-hub\kit\SPEC.md` —— 本文件
- `D:\aolong\repos\skill-hub\kit\README.md` —— 快速上手

### 2.2 运行期部署位置（dsh 实际加载处）
- `C:\Users\七兔\.dsh\profiles\web\node_modules\skill-hub\lib\{index.js,client.js}`
- `C:\Users\七兔\.dsh\profiles\web\node_modules\skill-hub\{dsh.plugin.json,package.json,cordis.patch.yml}`
- 服务端口：`3080`（loopback），启动命令 `npx --no-install @deepseek-ai/dsh web`

### 2.3 源仓库（保留历史版本）
- `D:\aolong\repos\skill-hub\package\src\...` —— 同 kit/src（曾是构建源）
- `D:\aolong\repos\skill-hub\{host.js,client.js}` —— 同 kit/legacy（cordis_define 存档）

---

## 3. 两种打包形态（选其一部署）

| 形态 | 路径 | 何时用 | 优点 | 缺点 |
|------|------|--------|------|------|
| **构建版（主用）** | `node_modules/skill-hub/lib/*` | 常规部署、复用分发 | 干净、随 profile 加载、可热更新 | 需 esbuild 构建 |
| **内存注入版（兜底）** | `kit/legacy/{host.js,client.js}` | 构建环境坏了 / 想免构建临时恢复 | 无需构建、即时生效 | 重启 dsh web 后丢失，需重新注入 |

> 内存注入版 `legacy/host.js` 里硬编码了 `C:\Users\七兔\...` 中文用户名路径，
> 移植到其他机器时务必改成目标用户的真实路径或用 `$env:USERPROFILE` 拼接。

---

## 4. 可移植性（复用到其他 Harness 产品）

1. **换技能目录**：host 端 `resolveRoots()` 默认扫描 AutoClaw/CodeBuddy/WorkBuddy 三端。
   可通过环境变量覆盖，无需改源码：
   ```powershell
   $env:SKILL_HUB_DIRS = '[{"label":"MyHarness","path":"C:\\skills"},"/other/skills"]'
   # 然后重启 dsh web
   ```
   数组元素可为纯字符串路径，或 `{ id?, label?, path }` 对象。
2. **换标签/文案**：`kit/src/client/index.js` 内 `g.label` 来自 host 返回；
   按钮文案「🧩 技能」、面板标题「技能库」、`placeholder`「搜索技能名或简介…」均直接改字符串即可。
3. **换插入动作**：`insert()` 默认插入 `@技能名`，若目标 harness 用别的语法（如 `/skill`）改这一处。
4. **换路由/插槽**：host 路由 `apply()` 中的 `path`；client 插槽 `slots.inject('conversation.input.left', ...)`。
5. 改完 `src/` 后执行 `deploy.ps1 -Build -Restart`。

---

## 5. 踩坑记录（必读，避免在同样地方再栽）

1. **中文用户名路径**：PowerShell 里硬编码 `C:\Users\七兔\...` 会被解析成乱码导致命令失败。
   **一律用 `$env:USERPROFILE` 拼接**（如 `Join-Path $env:USERPROFILE '.dsh\...'`）。
2. **`$pid` 是保留变量**：PowerShell 中 `$pid` 表示当前进程 ID，不能当循环变量用，
   改用 `$procId` / `$_`（如 `Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ }`）。
3. **UTF-8 BOM 破坏 frontmatter**：部分编辑器给 SKILL.md 加 BOM，`^---` 匹配不上导致解析失败。
   **解析前先 `mdText.replace(/^\uFEFF/, '')`**（已在 `parseDescription` 内处理，勿删）。
4. **折叠多行 `description` 遇空行**：`description: >` 块内允许空行，解析时遇到空行应 `continue` 而非 `break`，
   否则 `72-daoyuan` 等长描述会被截断。
5. **`legacy/host.js` 硬编码中文路径**：见第 3 节，移植必改。
6. **esbuild 在 Windows 的 win32 二进制问题**：`npm i esbuild` 后直接 `node build.mjs` 可能报
   `Socket.readFromStdout` 错误（平台二进制缺失）。**可靠做法**是用仓库中已验证可用的 esbuild 二进制：
   `node D:\aolong\repos\skill-hub\package\node_modules\esbuild\bin\esbuild <args>`。
   （kit 自带 `src/node_modules/esbuild` 多数情况下也能用，若失败改用上述方式。）
7. **浏览器不刷新**：部署/重启后 Web UI 不更新，需 **`Ctrl+Shift+R` 硬刷新**。
8. **client 用 `require('react')`**：`__ModuleLoader__` 的 CJS 工厂闭包只暴露 `require`，
   不直接暴露 `React`，必须从 `react` 模块取（已在 client 顶部处理）。
9. **client 样式用 DOM 注入**：CJS 路径不暴露 `styles` 服务，样式通过 `document.createElement('style')` 注入，
   框架会自动打 `data-plugin=skill-hub` 标签。
10. **构建格式铁律（host ESM / client CJS+banner）**：`package.json` 声明了 `"type": "module"`，
    所以 `.js` 文件在 Node 里按 ESM 加载。
    - **host `lib/index.js`** 必须用 `--format=esm`（CJS 会报 `module is not defined in ES module scope`）。
    - **client `lib/client.js`** 必须用 `--format=cjs` + `window.__ModuleLoader__.load(...)` banner/footer
      （浏览器端走 ModuleLoader，ESM 会报 `React is not defined`）。
    - `build.mjs` 的配置已正确区分两套格式；**手动跑 esbuild 时切勿给 host 加 banner**（会在 Node 报 `window is not defined`）。
    - 完整构建命令见 `build.mjs`；`deploy.ps1 -Build` 会调用它。

---

## 6. 故障快速修复 SOP

### 6.1 服务能看到但技能列表为空 / 报错
- 先验证接口：`Invoke-RestMethod -Uri http://127.0.0.1:3080/api/skill-hub/list`
- 某组返回 `error` 字段 → 该端技能目录路径/权限问题，检查 `resolveRoots()` 对应 `path` 是否存在。
- 接口 404 → host 半未加载，确认 `node_modules/skill-hub/lib/index.js` 与 `dsh.plugin.json` 是否齐全。

### 6.2 一键修复（最常用）
```powershell
cd D:\aolong\repos\skill-hub\kit
pwsh deploy.ps1 -Restart
# 浏览器 Ctrl+Shift+R
```

### 6.3 完全重建并部署
```powershell
cd D:\aolong\repos\skill-hub\kit
pwsh deploy.ps1 -Build -Restart
```

### 6.4 构建环境坏了（esbuild 异常）
直接使用 **预编译 `lib/`**（已含 env 覆盖逻辑，无需构建）：
```powershell
pwsh deploy.ps1 -Restart   # 不带 -Build，直接复制 kit/lib
```
仍不行则改用 **内存注入兜底**：把 `kit/legacy/{host.js,client.js}` 内容分别作为
`code.host` / `code.client` 交给 `cordis_define`（注意改 legacy/host.js 里的中文路径）。

### 6.5 dsh web 端口冲突 / 僵尸进程
- 查监听：`(Get-NetTCPConnection -LocalPort 3080).OwningProcess`
- 杀进程：`Stop-Process -Id <pid> -Force`
- `npx` 启动常显示 skipped/exited 0 但后台 node 仍在跑，端口冲突时先查杀再启。

---

## 7. 复用清单（打包发给别人 / 其他 Harness 时）

必带：`src/`（或 `lib/` 二选一即可运行）、`deploy.ps1`、`dsh.plugin.json`、本 `SPEC.md`。
建议带：`legacy/`（兜底）、`README.md`、`cordis.patch.yml`、`package.json`。
可省略：`lib/*.map`（调试用，体积大）。

---

## 8. 排障 SOP（实战踩坑，已验证）

### 8.1 dsh web 重启后页面打不开 / 3080 无监听
症状：进程在跑（114MB 左右）但 `Get-NetTCPConnection -LocalPort 3080` 无监听，stderr 报
`Error: failed to import loader entry browser (@anweat/dsh-browser): Cannot find package '@anweat/dsh-browser'`。
根因：`~/.dsh/profiles/web/node_modules` 缺 `@anweat/dsh-browser`（它是 `dsh-web-search-pro` bundle 注册的 `browser` loader 入口依赖），dsh 启动链直接崩。
修复（用隔离安装，避开 profile 的 github: 依赖）：
```powershell
$nodeBin=Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions\22.22.2'
$env:PATH="$nodeBin;$env:PATH"
# 1) 在临时目录单独装（只从 npm 拉，不会去碰 github.com:443 的 github: 依赖）
$temp=Join-Path $env:USERPROFILE 'AppData\Local\Temp\dshfix'
New-Item -ItemType Directory -Force -Path $temp | Out-Null
Set-Location $temp
npm install @anweat/dsh-browser --no-audit --no-fund
# 2) 把新增的包拷进 profile，跳过已存在的以保全 pnpm 符号链接
$prof=Join-Path $env:USERPROFILE '.dsh\profiles\web'
Get-ChildItem -Directory (Join-Path $temp 'node_modules') | Where-Object { $_.Name -notmatch '^\.' } | ForEach-Object {
  $tgt=Join-Path (Join-Path $prof 'node_modules') $_.Name
  if(-not (Test-Path $tgt)){ Copy-Item $_.FullName $tgt -Recurse -Force }
}
```
**切勿用 `pnpm add @anweat/dsh-browser`**：它会重解整棵依赖树，去拉 profile 里 `github:` 依赖（本机直连 github.com:443 不通）→ 超时失败且不落盘。
重启 dsh 后应看到 `dsh web: http://127.0.0.1:3080`。

### 8.2 技能选中后无法调用 / 点击无反应 / 覆写已输入内容
**第一阶段（2026-08-24）— 点击无反应**：客户端 `insert()` 旧代码调用 `inputActions.insertText()` / `append()`，但当前 dsh 0.1.0-rc.6 的 `InputActions` 接口（`deepseek-harness/.../ui-conversation/src/client/input/contract.ts`）只有 `setDraft(text)` 与 `submit()`，旧方法不存在 → 静默 no-op。当时改为直接 `setDraft('@' + name)`。

**第二阶段（2026-09-08）— 覆写已输入内容**：`setDraft(text)` 是**整体替换草稿**，不是插入——用户先输入文字再选技能，原文被整段吃掉。最终修复（2026-09-08，兔兔实测通过）：槽位组件经 `props.useInput` hook（uiSession provide 通道，session 作用域槽位均有）读取实时草稿，**拼接后写回**：

```js
const insert = (name) => {
  try {
    const a = props.inputActions
    if (a && typeof a.setDraft === 'function') {
      const token = '@' + name
      const base = String(latest.current.draft || '').replace(/\s+$/, '')
      const next = !base ? token : base.endsWith(token) ? base : base + ' ' + token
      a.setDraft(next)
    }
  } catch (_) {}
  setOpen(false)
}
```

组件头部需挂 `latest` ref（`useInput((s) => s)` 取 `input.draft`），槽位注册处把 `useInput: props.useInput` 透传给组件；参照实现见 `dsh-composer-attachments`（同一契约的成熟用例）。指令句变体（desktop 部署版 `pick()`）同理：原文后空行追加整段指令，重复选同一技能按「整段已存在」去重。
改后点击技能会**保留原文追加** `@技能名`，**不自动发送**——让用户继续编辑后再手动发送。
**切勿加 `submit()`**：否则点击技能后立即发送，用户来不及补充内容，agent 只收到 `@技能名` 导致空转（已踩过）。
**切勿裸用 `setDraft(新内容)`**：它替换全稿，永远先读 `useInput` 再拼接（已踩过，2026-09-08）。

**第三阶段（2026-09-08 晚）— 置顶（方案A）+ 引用条对齐**：兔兔要求技能引用排到正文**前方**。现行为：选技能时把草稿里**所有**技能引用聚拢到最前（保持原引用顺序），新选的接在引用区末尾（重复选同一引用去重），剩余正文殿后——无论草稿原本多乱，最终恒为「技能引用区 → 正文」。指令句变体按行前缀 `请加载并使用技能「` 识别引用块；@token 变体按 `(^|\s)@[^\s]+` 识别引用 token。同一套 live 草稿重建逻辑（`latest.current.draft` + `setDraft(next)`）。
同轮附带 UI 修正：dsh-at-file 的 `FilesDock` 引用条（草稿含 `@` 引用时出现在输入框上方的 pill 行，`conversation.input.dock` 槽位）原生没有卡片侧边距——pills 比 composer 卡片左缘凸出约 16px（`--dsh-composer-side-clearance`）。skill-hub 注入一条对齐样式覆盖（`.dsh_atFile_rail { width: min(calc(var(--dsh-composer-card-max-width) + 2*var(--dsh-composer-side-clearance)), 100%); align-self: center; padding: 0 var(--dsh-composer-side-clearance); }`，镜像核心 `.wSkVaW_composerHero` 的宽度/居中合同），随 skill-hub 部署矩阵走，不怕 at-file 升级冲掉。上游正解是给 dsh-at-file 提 PR，待议。
改源码后需重建 `lib/client.js` 再部署（或直接改预编译 `lib/client.js` 跳过 esbuild）。

### 8.3 本机重建 esbuild 偶发失败
`package/node_modules/esbuild` 原生二进制在本机偶发 spawn 失败（报 `signal: null, output: [null,null,null]`）。
`deploy.ps1 -Build` 已改为失败时仅告警并继续用预编译 `lib/`（kit/lib 已含 8.1/8.2 修复）。日常修复用 `pwsh deploy.ps1`（不带 `-Build`）最稳；确需重建时直接用 `package\node_modules\esbuild\bin\esbuild` 二进制 + 绝对路径，且命令里所有路径走 `$env:USERPROFILE` 拼接（手敲中文路径会被 GBK 破坏）。

### 8.4 中文路径通用陷阱
- 工具临时 `.ps1` 按 GBK 读，手敲含中文（如 `七兔`）的路径会变 `涓冨厰` 乱码 → 命令里一律 `$env:USERPROFILE` 拼接。
- `search_content` 给含中文路径会回退成全仓搜索 → 改用 PowerShell `Select-String -Path (Join-Path $env:USERPROFILE '...')`。
