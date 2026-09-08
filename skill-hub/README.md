# skill-hub（技能中心插件）

DeepSeek `dsh` 的「技能中心」插件：在对话输入框旁加「🧩 技能」按钮，点开列出三端（AutoClaw / CodeBuddy / WorkBuddy）技能库，搜索后把 `@技能名` 填入输入框。

## 复用 / 部署（首选：kit 一键）

所有可复用内容已整合进 `kit/` 自包含打包（源码 + 预编译产物 + 一键脚本 + 规范）。

- 一键部署/修复：`pwsh kit/deploy.ps1 -Build -Restart`（杀 3080 旧进程 → 重启 dsh web → 校验 `/api/skill-hub/list`）
- 仅复制预编译产物：`pwsh kit/deploy.ps1`
- 干跑预览：`pwsh kit/deploy.ps1 -WhatIf`
- 给新 AGENT 的复用指令：见 **`kit/AGENT_INSTRUCTIONS.md`**（一句话让 Agent 读取并按「场景一」执行即可，无需解释背景）

kit 内文档：
- `kit/README.md` —— 快速上手
- `kit/SPEC.md` —— 规范 + 踩坑 + 恢复 SOP（必读）
- `kit/AGENT_INSTRUCTIONS.md` —— 跨会话 / 跨 Harness 一键复用指令

## 兜底：内存注入版（旧方式，构建/部署链路不可用时）

若 kit 的构建或部署链路不可用，可用 `cordis_define` 内存注入版（与 `kit/legacy/` 内容一致）：

- 存档代码：`host.js` / `client.js`（仓库根，等价于 `kit/legacy/`）
- 让 Agent：「恢复 skill-hub 插件，代码在 `D:\aolong\repos\skill-hub\host.js` 和 `client.js`」
- Agent 会 `cordis_define`（plugin.kind=new，idPrefix=skhub，host/client 取对应文件）→ `cordis_run` 激活 → UI 批准后生效
- 注意：内存注入版**重启 dsh web 后丢失**，需重新注入；`host.js` 内硬编码中文用户名路径，移植必改

## 插件行为

- Host：扫描三端 skills 目录，解析 SKILL.md frontmatter，经 `/api/skill-hub/list` 返回合并去重目录
- Client：`conversation.input.left` 插槽注册技能条，点击把技能引用**置顶**到正文前方——先经 `useInput` 读当前草稿，把草稿里所有技能引用聚拢到最前（按引用顺序）、新选的接在引用区末尾（去重）、正文殿后，永不覆写已输入内容（2026-09-08 晚升级为方案A，见 kit/SPEC.md §8.2）
- 附带 UI 修正：注入一条对齐样式，让 dsh-at-file 的引用条（草稿含 `@` 引用时出现在输入框上方的 pill 行）与输入框卡片左缘对齐（dock 槽位原生缺 side-clearance，pill 会左凸 16px）
- 共用现有三库存储路径，不新建文件夹，不占模型上下文
