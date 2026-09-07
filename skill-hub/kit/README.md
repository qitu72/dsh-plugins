# skill-hub kit（技能中心插件 · 可复用打包）

把 skill-hub 插件的所有可复用内容（源码 / 预编译产物 / 清单 / 一键脚本 / 规范）整合在此，
用于：① 复用到其他类 DeepSeek Harness 产品；② 出错时快速布置与修复。

## 目录结构

```
kit/
  src/                      # 可编辑源码（改动后需 -Build 重建）
    index.js                # host 半：/api/skill-hub/list 路由 + 三端技能扫描
    client/index.js         # client 半：🧩 技能按钮 + 弹窗 + 搜索 + 外部点击关闭
    build.mjs               # esbuild 构建脚本
    dsh.plugin.json         # 插件清单
    package.json            # build 脚本 + esbuild 依赖
    cordis.patch.yml        # 挂载点映射
  lib/                      # 预编译产物（已验证可用，部署即用，无需构建）
    index.js  client.js  *.map
  legacy/                   # 内存注入兜底版（无需构建，重启后需重新注入）
    host.js  client.js
  deploy.ps1                # 一键部署 / 修复脚本
  SPEC.md                   # 规范 + 踩坑 + 恢复 SOP（必读）
  README.md                 # 本文件
```

## 快速上手

### 部署（最常用，直接复制预编译产物 + 重启）
```powershell
cd D:\aolong\repos\skill-hub\kit
pwsh deploy.ps1 -Restart
# 浏览器 Ctrl+Shift+R 硬刷新生效
```

### 改过源码后重建并部署
```powershell
pwsh deploy.ps1 -Build -Restart
```

### 只演练不改动
```powershell
pwsh deploy.ps1 -WhatIf
```

## 复用 / 移植到其他 Harness

1. 复制整个 `kit/` 到目标机器。
2. 若要换技能目录而不改源码，用环境变量覆盖（详见 SPEC.md §4）：
   ```powershell
   $env:SKILL_HUB_DIRS = '[{"label":"MyHarness","path":"C:\\skills"},"/other/skills"]'
   ```
3. 改文案/插入语法/路由/插槽：编辑 `src/client/index.js` 与 `src/index.js`（见 SPEC.md §4）。
4. 运行 `pwsh deploy.ps1 -Build -Restart`。

## 踩坑提示（详细见 SPEC.md §5）

- 中文用户名路径一律用 `$env:USERPROFILE` 拼接，禁止硬编码 `C:\Users\七兔\...`。
- 部署后浏览器必须 **Ctrl+Shift+R** 硬刷新。
- esbuild 在 Windows 偶有 win32 二进制报错，直接用 `kit/lib`（预编译）即可绕过构建。

## 验证

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3080/api/skill-hub/list
# 返回 { groups: [ AutoClaw / CodeBuddy / WorkBuddy 各含 skills[] ] }
```
