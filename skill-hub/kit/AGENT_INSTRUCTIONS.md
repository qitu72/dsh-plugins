# skill-hub kit — AGENT 一键复用指令

本文件是可复用交付物。AGENT 拿到本文件后，按下方场景执行即可，无需理解内部细节。
任何疑问先读同目录 `SPEC.md`，不要猜路径。

## 这是什么
DeepSeek `dsh` 的「技能中心」插件 kit（前端 UI + 后端 API），已自包含：
- `src/` 可移植源码（host 入口 `index.js`、前端 `client/index.js`、构建 `build.mjs`、3 个插件清单）
- `lib/` 预编译产物（直接部署用，已含 `SKILL_HUB_DIRS` 环境变量覆盖）
- `legacy/` 内存注入版（给不支持 cordis 插件机制的目标 harness）
- `deploy.ps1` 一键部署/修复脚本
- `SPEC.md` 完整规范、`README.md` 快速上手

## 场景一：部署 / 修复到本机 dsh web（最常见）
在 PowerShell 执行（路径含中文用户名，必须用 `$env:USERPROFILE` 拼接）：
```powershell
& ($env:USERPROFILE + '\.workbuddy\binaries\node\versions\22.22.2\npm.cmd')  # 仅确保 node/npx 在 PATH
pwsh 'D:\aolong\repos\skill-hub\kit\deploy.ps1' -Build -Restart
```
- `-Build`：在 `kit\` 根用 esbuild 重建 `lib`（esbuild 已装在 `kit\src\node_modules`）
- `-Restart`：杀掉占用 3080 端口的旧进程 → `npx --no-install @deepseek-ai/dsh web` 重启 → 自动校验 `http://127.0.0.1:3080/api/skill-hub/list`
- 预期输出：`OK: 3 groups, 312 skills total`
- 浏览器 `Ctrl+Shift+R` 硬刷新生效
- 只复制预编译产物（不重启）：`pwsh '...\deploy.ps1'`
- 干跑预览（不改任何文件）：`pwsh '...\deploy.ps1' -WhatIf`

## 场景二：移植到其他类似 Harness（换目录 / 换产品）
1. 用 `SKILL_HUB_DIRS` 环境变量覆盖技能根目录，无需改源码：
   `SKILL_HUB_DIRS='[{"label":"MyHarness","path":"C:\\skills"},"/other/skills"]'`
   （JSON 数组，元素可为 `{label,path}` 或纯路径字符串）
2. 在 `kit\` 根目录跑 `node build.mjs` 重建 `lib`
3. 把 `kit\lib\` 与 `kit\src\` 下 3 个清单（`dsh.plugin.json`/`package.json`/`cordis.patch.yml`）复制到目标 harness 的插件目录
4. 若目标 harness 不支持 cordis 插件，改用 `kit\legacy\` 的 `host.js`/`client.js` 内存注入版

## 必读的环境约束（已在脚本内固化，勿重复踩坑）
- 路径含中文用户名：一律用 `$env:USERPROFILE` 拼接；node/npx 走 `C:\Users\七兔\.workbuddy\binaries\node\versions\22.22.2`
- 部署脚本必须纯英文、用 `$args` 解析：Windows PowerShell 默认 GBK 读 `.ps1`，中文脚本会乱码导致括号/字符串解析失败
- 本机无法直接 `git clone github.com:443`，但 npm 源 `registry.npmjs.org` 正常，`npx`/`npm install` 可用
- 详细设计、可移植性、踩坑与恢复 SOP 见同目录 `SPEC.md`
