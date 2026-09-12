# skill-hub（技能中心插件 · v1.2.0）

DeepSeek Harness（dsh）web GUI 的「技能中心」插件：

- **技能**：自动发现本机各个 Agent 的技能库（DeepSeek Harness / CodeBuddy / WorkBuddy / Claude Code / OpenCode / OpenClaw / Codex / Cursor / Windsurf …），搜索后把 `@技能名` 填入输入框
- **插件**：列出当前 profile 已安装的全部 dsh 插件，一键启用 / 禁用（重启生效）

> 目录发现是**自动的**：任何 `<用户主目录>/.<agent>/skills` 形式的技能库都会被扫到，
> 仓库里不出现你的用户名或路径，换机器不用改一行代码。

## 安装（三选一）

### 方式 A：一键安装脚本（推荐）

前提：本机已安装 dsh，且 PowerShell 里有 `node`/`npx`。

```powershell
# 在克隆/解压出来的 skill-hub/kit 目录里执行
pwsh install.ps1                # 复制文件 + 注册 bundle 到 profile（不重启）
# 浏览器 Ctrl+Shift+R 硬刷新生效
```

脚本会自动：发现你的 dsh profile（web / default / desktop）→ 复制 `lib/` 到
`<profile>/node_modules/skill-hub` → 把 `skill-hub` 写进 profile 的
`dsh.profile.bundles` 数组（**不写这一步 dsh 不会加载插件**——这是最常见的
「复制了文件却没反应」的原因）。

可选参数：`-ProfileName web`（指定 profile）、`-Port 3080`（验证端口）、
`-Restart -WorkDir <你的dsh项目目录>`（自动重启 dsh web）。

### 方式 B：npm 包（tgz）

```powershell
# 在 dsh 的 profile 目录里执行（~/.dsh/profiles/<你的profile>）
npm install --no-save <path-to>\skill-hub-1.2.0.tgz
```

然后把 `"skill-hub"` 加进该 profile `package.json` 的 `dsh.profile.bundles`
数组，重启 dsh web。

### 方式 C：手动复制

1. 把 `kit/lib/` 复制到 `<profile>/node_modules/skill-hub/lib/`
2. 把 `kit/src/` 下的 `dsh.plugin.json`、`package.json`、`cordis.patch.yml`
   复制到 `<profile>/node_modules/skill-hub/`
3. 把 `"skill-hub"` 加进 profile `package.json` 的 `dsh.profile.bundles` 数组
   （`dependencies` 里没有就手动补：`"skill-hub": "*"`）
4. 重启 dsh web，浏览器 `Ctrl+Shift+R`

## 技能目录自动发现

插件按以下优先级决定展示哪些技能库：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | `SKILL_HUB_DIRS` 环境变量 | JSON 数组，完全替换（向后兼容 v1.1） |
| 2 | `~/.dsh/skill-hub.json` 的 `roots` | 同上，完全替换 |
| 3 | 自动探测 + 配置文件的 `extraRoots` | 默认路径 |
| 4 | 兜底 `~/.dsh/skills` | 上面全空时 |

**自动探测**规则：已知 Agent 静态表（`.dsh` `.codebuddy` `.workbuddy` `.claude`
`.codex` `.opencode` `.openclaw` `.openclaw-autoclaw` `.qoder` `.cursor`
`.windsurf` `.agents`）+ 通用兜底（扫描主目录下所有 `.xxx/skills` 子目录，
未知 Agent 也能被捞到）。**目录不存在就不展示**——别人的机器上不会出现
一堆「读取失败」的空组。

添加一个自定义目录（不影响自动发现），编辑 `~/.dsh/skill-hub.json`：

```json
{
  "extraRoots": [
    "D:\\shared\\skills",
    { "label": "我的技能库", "path": "C:\\Users\\me\\my-skills" }
  ]
}
```

改完重启 dsh web 生效。想完全手动控制则用 `"roots": [...]`（替换一切）；
`"autoScan": false` 可关闭主目录扫描。

## 验证

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3080/api/skill-hub/list
# 期望：{ groups: [ { id: 'dsh', skills: [...] }, ... ] }
```

浏览器里：输入框左侧出现「🧩 技能」按钮，点开有技能/插件两个页签。

## 卸载

1. 从 profile `package.json` 的 `dsh.profile.bundles` 数组删掉 `"skill-hub"`
2. 删除 `<profile>/node_modules/skill-hub/`
3. 重启 dsh web

## 目录结构

```
skill-hub/
  kit/
    install.ps1        # 一键安装（含 bundle 注册，给新用户）
    deploy.ps1         # 部署/修复（假设 bundle 已注册过，维护者用）
    src/               # 可编辑源码（host index.js / client index.js / build.mjs / 清单）
    lib/               # 预编译产物（部署即用，无需构建）
    legacy/            # 内存注入兜底版（cordis_define 用，重启丢失）
    SPEC.md            # 设计规范 + 踩坑记录（必读）
    AGENT_INSTRUCTIONS.md  # 给 AI Agent 的一键复用指令
  skill-hub-1.2.0.tgz  # npm 安装包
```

## 插件行为（技术细节）

- Host：扫描各技能库目录，解析 SKILL.md frontmatter，经 `/api/skill-hub/list` 返回合并目录；`/api/skill-hub/plugins` + `/toggle` 提供插件启停
- Client：`conversation.input.left` 插槽注册技能条，点击把技能引用**置顶**到正文前方，永不覆写已输入内容
- 共用现有各库存储路径，不新建文件夹，不占模型上下文
