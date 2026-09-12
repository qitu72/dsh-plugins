# skill-hub kit — AGENT 一键复用指令

本文件是可复用交付物。AGENT 拿到本文件后，按下方场景执行即可，无需理解内部细节。
任何疑问先读同目录 `SPEC.md`，不要猜路径。

## 这是什么
DeepSeek `dsh` 的「技能中心」插件 kit（前端 UI + 后端 API），已自包含：
- `src/` 可移植源码（host 入口 `index.js`、前端 `client/index.js`、构建 `build.mjs`、3 个插件清单）
- `lib/` 预编译产物（直接部署用，含目录自动发现与 `SKILL_HUB_DIRS` 环境变量覆盖）
- `legacy/` 内存注入版（给不支持 cordis 插件机制的目标 harness）
- `install.ps1` 一键安装（含 bundle 注册）/ `deploy.ps1` 维护者部署修复脚本
- `SPEC.md` 完整规范、`README.md` 快速上手

## 场景一：安装 / 修复到本机 dsh（最常见）
在 PowerShell 进入本 kit 目录后执行：
```powershell
pwsh install.ps1
```
- 脚本自动完成：发现 dsh profile → 复制 `lib/` + 3 个清单到 `<profile>\node_modules\skill-hub` → **把 `skill-hub` 写进 profile `package.json` 的 `dsh.profile.bundles` 数组与 `dependencies`**（不注册 bundle 插件不会被加载——最常见的「文件复制了却没反应」就是这个原因）
- 可选：`-ProfileName <名字>` 指定 profile；`-Restart -WorkDir <dsh项目目录>` 自动重启
- 完成后浏览器 `Ctrl+Shift+R` 硬刷新生效
- 预期验证输出：`OK: N groups, M skills total`（N 取决于本机探测到的 Agent 数量）
- 干跑预览（不改任何文件）：`pwsh install.ps1 -WhatIf`
- 仅想刷新已注册插件的文件（bundle 已在数组里）也可用：`pwsh deploy.ps1`

## 场景二：移植到其他类似 Harness（换目录 / 换产品）
1. 技能目录自动发现：任何 `<主目录>/.<agent>/skills` 都会被扫描到，无需配置。
   需要追加自定义目录时，写 `~/.dsh/skill-hub.json`：
   `{"extraRoots":[{"label":"MyHarness","path":"C:\\skills"}]}`
   完全手动控制用 `{"roots":[...]}`；`{"autoScan":false}` 关闭主目录扫描。
   也可用环境变量（替换一切）：`SKILL_HUB_DIRS='[{"label":"MyHarness","path":"C:\\skills"}]'`
2. 重新构建：在 `kit\src` 内 `npm install` 后运行 `node src\build.mjs`
   （build.mjs 路径锚定自身位置，任何 cwd 均可运行；产物输出到 `kit\lib`）
3. 把 `kit\lib\` 与 3 个清单（`dsh.plugin.json`/`package.json`/`cordis.patch.yml`）复制到目标 harness 的插件目录并按其机制注册 bundle
4. 若目标 harness 不支持 cordis 插件，改用 `kit\legacy\` 的 `host.js`/`client.js` 内存注入版
   （其中 HOME 从 `process.env.USERPROFILE/HOME` 解析，解析失败时是 `CHANGE_ME` 占位符，手改即可）

## 必读的环境约束（已在脚本内固化，勿重复踩坑）
- 路径含中文用户名：一律用 `$env:USERPROFILE` 拼接；**不要**在脚本/文档里硬编码任何用户名
- 脚本必须纯英文、用 `param()` 解析参数：Windows PowerShell 默认 GBK 读 `.ps1`，中文脚本会乱码导致括号/字符串解析失败
- 构建/部署产物之后浏览器必须 **Ctrl+Shift+R** 硬刷新
- 详细设计、可移植性、踩坑与恢复 SOP 见同目录 `SPEC.md`
