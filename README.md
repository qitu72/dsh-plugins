<div align="center">

# 🧩 dsh-plugins

**让 DeepSeek Harness 顺手到离不开的三个自制插件**

贴图零步骤 · 技能零搬运 · 文件变卡片

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform: DeepSeek Harness](https://img.shields.io/badge/platform-DeepSeek%20Harness-blue)
![Type: Cordis Plugins](https://img.shields.io/badge/type-Cordis%20Plugins-orange)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

**[🪟 贴图附件](#1--dsh-composer-attachments贴图从此不需要仪式感) · [🧩 技能中心](#2--skill-hub别人的技能不用安装也能用) · [🗂️ 交付物卡片](#3--dsh-deliverables-card你可能已经在用它了)**

</div>

---

## 😩 是不是也遇到过

- 给 AI 看张截图：截图工具 → 保存文件 → 点附件 → 文件选择器 → 翻目录 → 上传。**五步走完，聊天的热情已经没了**——明明剪贴板里就有。
- 同时养着好几个 Agent，每个都有一套自己的技能库。想用一个技能，先回想它装在哪边。
- Agent 说「文件已经写好了」，消息流里躺着的却是一坨工具调用 JSON，你还得自己去文件夹里翻。

这三个插件，每个解决一个。

---

## 🧩 插件详解

### 1 · 🪟 [`dsh-composer-attachments`](dsh-composer-attachments) — 贴图从此不需要仪式感

**剪贴板里有什么，Ctrl+V 一下就到对话框里。** 粘贴监听在整页生效——截图工具抢了焦点也照贴不误；桌面端 paste 事件不给力的环境还有 keydown 直读系统剪贴板的兜底，保证「按了就有」。贴入成功有绿色 toast 反馈，和原生粘贴事件按字节比对，绝不出双份。

**支持什么文件？一张表说清：**

| 类型 | 处理方式 |
|------|----------|
| 🖼️ **图片** PNG / JPEG / WebP / GIF | 进原生缩略图轨（可预览、可单张移除），发送时随消息上传给模型 |
| 🎬 **视频** MP4 / MOV / MKV / AVI / WebM | 自动上传到工作区 `.dsh-uploads/<日期>/`，草稿插入 `📎 @路径` 引用，Agent 按路径取用 |
| 🎧 **音频** MP3 / WAV / FLAC / M4A / OGG | 同上 |
| 📕 **文档** PDF / Word / Excel / PPT / Markdown / 代码文本 | 同上 |
| 🗜️ **压缩包** ZIP / RAR / 7z / tar.gz | 同上（单批总大小 ≤ 64MB） |

上传后的非图片附件在输入框上方渲染成**按扩展名自动配色的小 chip**（ × 一点即撤），草稿里的 `📎 @路径` 引用随消息一起发出——Agent 端拿到的是工作区里的真实文件，可读可处理。

> 适合：每天和 AI 聊天时动不动就想「给你看个截图」「发你个文件」的人。

### 2 · 🧩 [`skill-hub`](skill-hub) — 别人的技能，不用安装也能用

输入框旁常驻一枚 **🧩 技能** 按钮。点开，看到的是**横跨多个 Agent 技能库的合并目录**——WorkBuddy、CodeBuddy、AutoClaw 的技能原地列出，**一个都不用搬进 DSH 的技能仓库**。搜索、点选，插件自动把「加载并使用该技能」的指令回填进输入框，DSH 直接去技能的原库读取使用。

- 🚚 **零拷贝**：其他 Agent 的技能不安装、不复制、不同步，就地调用
- 🔎 跨库搜索：三端技能一个搜索框搞定，自动去重
- ⚡ 点击即用：不用记命令、不用写路径
- 🛠️ 自带 `kit/deploy.ps1`：一键部署 / 重建 / 重启 / 校验，坏了自己会修

> 适合：同时养着多个 Agent、技能分散在各处、又懒得维护多份副本的人。

### 3 · 🗂️ [`dsh-deliverables-card`](dsh-deliverables-card) — 你可能已经在用它了

Agent 每次写文件，消息流里本是一段生硬的工具调用 JSON。装上它，每次落盘自动渲染成一张**可点击的文件卡片**：按扩展名配图标（🌐 html / 📝 md / 📗 xlsx / 🖼️ 图片…），文件名、路径一目了然，**一键打开**；HTML 交付物还能在侧边栏**新标签页直接预览**。

它的设计目标是「无感」：装上之后你会忘了它的存在，因为看惯了就回不去了——哪天卸载它，面对满屏 JSON 参数的那一刻你就懂了。

> 适合：让 Agent 写报告 / 做页面 / 出表格，在乎交付体验的人。

---

> 🔄 **另有一位老将搬了家**：跨 Agent 技能同步 CLI **skill-sync**（一套技能库多处共用，调教一次全端生效）已迁移至 **[72boom/72skill](https://cnb.cool/72boom/72skill)** —— 它不挑 Agent，所有玩家都能用，欢迎过去瞅瞅。

---

## 🚀 安装

三个插件复制即装：

```powershell
git clone https://cnb.cool/72boom/dsh-plugins.git
cd dsh-plugins

# 复制插件到 DSH web profile（以贴图插件为例）
Copy-Item dsh-composer-attachments "$env:USERPROFILE\.dsh\profiles\web\node_modules\" -Recurse -Force

# 在 ~/.dsh/profiles/web/package.json 的 dsh.profile.bundles 数组中加入 "dsh-composer-attachments"
# 重启 DSH web / 桌面端，完成
```

各插件的实现细节与进阶用法见各自文件夹内的 README。

## ❓ FAQ

<details>
<summary><b>贴图插件在桌面端 Ctrl+V 没反应？</b></summary>

刷新页面（Ctrl+R）后重试；插件内置 keydown 直读剪贴板的兜底路径，若仍失败请提交 Issue 并附上 📋 按钮的提示文案。
</details>

<details>
<summary><b>贴进去的图片什么时候上传？</b></summary>

图片以浏览器草稿形式挂在输入框上方，点击发送时才随消息一起编码上传——期间可随时点缩略图上的 × 撤下。
</details>

<details>
<summary><b>上传的文件放在哪？会被清理吗？</b></summary>

在工作区的 `.dsh-uploads/<日期>/` 下按天存放，不自动清理（路径就写在草稿的 `📎 @` 引用里，随时可查）。
</details>

## 🗺️ Roadmap

- [ ] composer-attachments：界面截图与演示动图（欢迎 PR）
- [ ] skill-hub：技能收藏 / 使用频次排序
- [ ] 新插件候选：会话导出美化

## 🤝 贡献

欢迎 Issue / PR：新插件、文档纠错都算。

## 📄 License

[MIT](LICENSE) © 2026 72boom
