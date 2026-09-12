# skill-hub kit（技能中心插件 · 可复用打包）

把 skill-hub 插件的所有可复用内容（源码 / 预编译产物 / 清单 / 一键脚本 / 规范）整合在此，
用于：① 新机器一键安装；② 出错时快速布置与修复。

## 目录结构

```
kit/
  src/                      # 可编辑源码（改动后需 -Build 重建）
    index.js                # host 半：技能目录自动发现 + /api/skill-hub/* 路由
    client/index.js         # client 半：🧩 技能按钮 + 弹窗 + 搜索 + 插件启停
    build.mjs               # esbuild 构建脚本（路径锚定自身，任何 cwd 可运行）
    dsh.plugin.json         # 插件清单
    package.json            # build 脚本 + esbuild 依赖
    cordis.patch.yml        # 挂载点映射
  lib/                      # 预编译产物（已验证可用，部署即用，无需构建）
    index.js  client.js  *.map
  legacy/                   # 内存注入兜底版（无需构建，重启后需重新注入）
    host.js  client.js
  install.ps1               # 一键安装（新用户用：含 bundle 注册）
  deploy.ps1                # 部署/修复（维护者用：假设 bundle 已注册）
  SPEC.md                   # 规范 + 踩坑 + 恢复 SOP（必读）
  README.md                 # 本文件
  smoke-resolve.mjs         # 目录发现冒烟测试（node smoke-resolve.mjs）
```

## 快速上手

### 新机器安装（复制文件 + 注册 bundle，最常用）
```powershell
cd <kit 目录>
pwsh install.ps1
# 浏览器 Ctrl+Shift+R 硬刷新生效
```

### 改过源码后重建并部署
```powershell
pwsh deploy.ps1 -Build -Restart
# esbuild 已装在 kit\src\node_modules（cd src && npm install 可重装）
```

### 只演练不改动
```powershell
pwsh deploy.ps1 -WhatIf     # 或 pwsh install.ps1 -WhatIf
```

### 验证目录自动发现
```powershell
node smoke-resolve.mjs      # 列出本机探测到的技能库分组
```

## 复用 / 移植到其他 Harness

技能目录**自动发现**：任何 `<主目录>/.<agent>/skills` 都会被扫描，无需配置。
追加自定义目录写 `~/.dsh/skill-hub.json`（详见 SPEC.md §4）：

```json
{ "extraRoots": [{ "label": "MyHarness", "path": "C:\\skills" }] }
```

改文案/插入语法/路由/插槽：编辑 `src/client/index.js` 与 `src/index.js`（见 SPEC.md §4），
然后 `pwsh deploy.ps1 -Build -Restart`。

## 踩坑提示（详细见 SPEC.md §5）

- 中文用户名路径一律用 `$env:USERPROFILE` 拼接，禁止硬编码 `C:\Users\<用户名>\...`。
- 部署后浏览器必须 **Ctrl+Shift+R** 硬刷新。
- esbuild 在 Windows 偶有 win32 二进制报错，直接用 `kit/lib`（预编译）即可绕过构建。
- **复制了文件却没反应**：bundle 没注册。用 `install.ps1`（会写
  `dsh.profile.bundles` 数组），或手动把 `"skill-hub"` 加进 profile `package.json`。

## 验证

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3080/api/skill-hub/list
# 期望：{ groups: [ { id: 'dsh', label: 'DeepSeek Harness', skills: [...] }, ... ] }
# groups 的数量与内容取决于本机探测到的 Agent 技能库
```
