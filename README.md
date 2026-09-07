# dsh-plugins — DeepSeek Harness 自定义插件集

本仓库收录 [DeepSeek Harness (DSH)](https://github.com/anywhere-labs/deepseek-harness-desktop) 的自定义 Cordis 插件。每个插件一个独立子文件夹（monorepo），文件夹即插件根：`package.json` + `cordis.patch.yml` + `dsh/`（client/host 实现）。

## 插件清单

| 插件 | 作用 |
|------|------|
| [`dsh-composer-attachments/`](dsh-composer-attachments) | 对话框贴图 / 附件。📋 一键贴图、📎 附件选择；**图片**走原生草稿轨（发送时随消息上传），**其他文件**上传到工作区 `.dsh-uploads/<日期>/` 并以 `📎 @相对路径` 引用插入草稿。亮点：document 级 paste 拦截器（截图工具抢焦点也能贴）+ **Ctrl+V keydown 直读系统剪贴板兜底** + 空 type 截图魔数识别（PNG/JPEG/GIF/WebP）+ 成功 toast + 与原生 paste 事件按字节比对去重 |
| [`dsh-deliverables-card/`](dsh-deliverables-card) | 交付物卡片渲染插件 |
| [`skill-hub/`](skill-hub) | 技能面板 / 部署套件。root = 构建产物（client.js / host.js），`kit/` = 开发套件（`deploy.ps1` 一键部署/重建/重启），`package/` = 打包工作区 |
| [`skill-sync/`](skill-sync) | 三端技能库同步 CLI（DeepSeek Harness ↔ CodeBuddy ↔ WorkBuddy）的 Python 重写。🚧 开发中快照 |

## 安装

```powershell
# 1. 复制插件文件夹到 web profile
Copy-Item dsh-composer-attachments "$env:USERPROFILE\.dsh\profiles\web\node_modules\" -Recurse -Force

# 2. 编辑 ~/.dsh/profiles/web/package.json，在 dsh.profile.bundles 数组中加入 "dsh-composer-attachments"

# 3. 重启 DSH web / 桌面端
```

## 说明

- 插件在 DSH 内通过 Cordis Slot 注入 UI（`conversation.input.left` / `conversation.input.dock` 等），宿主半通过 `webServer.register` 提供 HTTP API。
- `skill-sync` 尚在开发中，接口可能变化；Issue / PR 欢迎。
- License: [MIT](LICENSE)
