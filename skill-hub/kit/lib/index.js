// src/index.js
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var name = "skill-hub";
var inject = ["webServer"];
function isSkillDir(parent, entry) {
  if (entry.name.startsWith(".")) return false;
  if (entry.isDirectory()) return true;
  if (entry.isSymbolicLink()) {
    try {
      return statSync(join(parent, entry.name)).isDirectory();
    } catch {
      return false;
    }
  }
  return false;
}
function parseDescription(mdText) {
  mdText = mdText.replace(/^\uFEFF/, "");
  const fm = mdText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const body = fm[1];
    const m = body.match(/^description\s*:\s*(.*)$/m);
    if (m) {
      let first = m[1].trim();
      if (first.startsWith('"') && first.endsWith('"') || first.startsWith("'") && first.endsWith("'")) {
        first = first.slice(1, -1);
      }
      if (first === ">" || first === "|") {
        const rest2 = body.slice(m.index + m[0].length);
        const lines = [];
        for (const line of rest2.split(/\r?\n/)) {
          if (!line.trim()) continue;
          if (!/^\s/.test(line)) break;
          lines.push(line.trim());
        }
        first = lines.join(" ").replace(/\s+/g, " ").trim();
      }
      if (first) return first;
    }
  }
  const rest = fm ? mdText.slice(fm[0].length) : mdText;
  for (const line of rest.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^#/.test(t) || /^<!--/.test(t)) continue;
    return t.replace(/^[-*>•\d.\s]+/, "").replace(/[*_`]/g, "").slice(0, 140).trim();
  }
  return "";
}
function readSkill(parent, entry) {
  const name2 = entry.name;
  const mdPath = join(parent, name2, "SKILL.md");
  try {
    return { name: name2, description: parseDescription(readFileSync(mdPath, "utf8")) };
  } catch {
    return { name: name2, description: "" };
  }
}
function readSkillDirs(root) {
  return readdirSync(root, { withFileTypes: true }).filter((e) => isSkillDir(root, e)).map((e) => readSkill(root, e)).sort((a, b) => a.name.localeCompare(b.name));
}
function resolveRoots() {
  const raw = process.env.SKILL_HUB_DIRS;
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) {
        return arr.map(
          (d) => typeof d === "string" ? { id: d, label: d, path: d } : { id: d.id || d.path, label: d.label || d.id || d.path, path: d.path }
        );
      }
    } catch {
    }
  }
  return [
    { id: "dsh", label: "DeepSeek Harness", path: join(homedir(), ".dsh", "skills") },
    { id: "codebuddy", label: "CodeBuddy", path: join(homedir(), ".codebuddy", "skills") },
    { id: "workbuddy", label: "WorkBuddy", path: join(homedir(), ".workbuddy", "skills") }
  ];
}
function apply(ctx) {
  ctx.webServer.register({
    kind: "exact",
    path: "/api/skill-hub/list",
    handler(_req, res) {
      const roots = resolveRoots();
      const groups = roots.map((root) => {
        try {
          return { ...root, skills: readSkillDirs(root.path) };
        } catch (error) {
          return { ...root, skills: [], error: String(error && error.message || error) };
        }
      });
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ groups }));
    }
  });
  function readProfileManifest() {
    const profileName = process.env.DSH_PROFILE || "web";
    const dshHome = process.env.DSH_HOME || join(homedir(), ".dsh");
    const dir = join(dshHome, "profiles", profileName);
    const pkgPath = join(dir, "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const manifest = JSON.parse(raw);
    return { dir, pkgPath, raw, manifest };
  }
  const PLUGIN_DESC_ZH = {
    "@dhicoc/dsh-wuyun-liuqi": "\u4E94\u8FD0\u516D\u6C14\uFF08\u5E72\u652F\u63A8\u7B97\u3001\u75C5\u673A\u5206\u6790\u3001\u7ECF\u5178\u6587\u732E\uFF09",
    "@dsh-external/dsh-automation": "\u5B9A\u65F6\u4EFB\u52A1\uFF1A\u6309\u8BA1\u5212\u5728\u5168\u65B0\u4F1A\u8BDD\u4E2D\u6267\u884C\u7F16\u7801\u4EFB\u52A1",
    "@liustack/modlens": "\u7ED9\u7EAF\u6587\u672C\u6A21\u578B\u52A0\u89C6\u89C9\u80FD\u529B\uFF08\u57FA\u4E8E Antigravity CLI\uFF09",
    "@omdsh-dev/dsh-genui": "\u5BCC\u4EA4\u4E92 UI \u7EC4\u4EF6\uFF1A\u56FE\u8868/\u8868\u5355/3D/Mermaid \u5185\u5D4C\u5728\u56DE\u590D\u91CC",
    "dsh-at-file": "@\u8DEF\u5F84\u5F15\u7528\uFF1A\u641C\u7D22\u5DE5\u4F5C\u533A\u6587\u4EF6\u8DEF\u5F84\u4F46\u4E0D\u6CE8\u5165\u5185\u5BB9",
    "dsh-better-sidebar": "\u7C7B VSCode \u53F3\u4FA7\u680F\uFF08\u8D44\u6E90\u7BA1\u7406\u5668/\u7F16\u8F91\u5668/\u7EC8\u7AEF/Git/\u6D4F\u89C8\u5668\uFF09",
    "dsh-bilibili": "B\u7AD9\u89C6\u9891\u5206\u6790\uFF1A\u9010\u5B57\u7A3F\u4F18\u5148\u3001\u5B57\u5E55\u622A\u56FE\u3001\u6A21\u578B\u6458\u8981",
    "dsh-companion": "\u5B98\u65B9\u4F34\u4FA3\uFF1A\u5BF9\u8BDD\u5BFC\u51FA\u3001\u4E0A\u4E0B\u6587\u6458\u8981\u3001\u6210\u672C\u4F18\u5316\u3001\u5168\u5C40\u68C0\u7D22",
    "dsh-excel-chat": "Excel \u5BF9\u8BDD\u5F0F\u64CD\u4F5C\uFF1A\u5EFA\u8868/\u516C\u5F0F/\u6837\u5F0F/\u56FE\u8868\uFF0C\u81EA\u52A8\u6821\u9A8C",
    "dsh-office-tools": "Office \u5DE5\u5177\uFF1A\u4F1A\u8BDD\u5185\u521B\u5EFA/\u8BFB\u5199 Word/Excel/PPT",
    "dsh-plugin-sentinel": "\u63D2\u4EF6\u5B89\u88C5\u65F6\u9759\u6001\u5B89\u5168\u5BA1\u8BA1",
    "dsh-plugin-writing-guard": "\u5B66\u672F\u5199\u4F5C\u68C0\u67E5\u5668\uFF1A\u589E\u91CF\u67E5\u91CD\u3001\u5206\u6BB5\u9884\u5904\u7406\u3001\u5BC6\u5EA6\u9608\u503C",
    "dsh-stock-watch": "A\u80A1\u81EA\u9009\u80A1\u5B9E\u65F6\u884C\u60C5\u76EF\u76D8\u5F39\u7A97",
    "dsh-tool-writing": "\u957F\u7BC7\u7F51\u6587\u5199\u4F5C\u5F15\u64CE\uFF1A\u5E76\u884C\u751F\u6210\u3001\u8BBE\u5B9A\u7BA1\u7406\u3001\u8BED\u4E49\u68C0\u7D22",
    "dsh-video-downloader": "\u89C6\u9891/\u97F3\u9891\u4E0B\u8F7D\uFF08B\u7AD9/YouTube/\u6296\u97F3/\u5C0F\u7EA2\u4E66\uFF09",
    "dsh-web-search-pro": "\u589E\u5F3A\u7F51\u9875\u641C\u7D22\uFF1A\u591A\u5F15\u64CE\u8DEF\u7531\u3001\u7F13\u5B58\u3001Playwright \u6E32\u67D3",
    "dshmarket": "\u53EF\u89C6\u5316\u63D2\u4EF6\u5E02\u573A\uFF1A\u6D4F\u89C8/\u641C\u7D22/\u4E00\u952E\u5B89\u88C5\u793E\u533A\u63D2\u4EF6",
    "skill-hub": "\u6280\u80FD\u5E93\u4E0E\u63D2\u4EF6\u7BA1\u7406\u9762\u677F\uFF08\u672C\u63D2\u4EF6\uFF09",
    "vera": "Excel \u5BF9\u8BDD\u5F0F\u64CD\u4F5C\uFF08vera \u5206\u652F\u7248\u672C\uFF09"
  };
  function readPluginMeta(profileDir, pkgName) {
    const zh = PLUGIN_DESC_ZH[pkgName];
    try {
      const p = join(profileDir, "node_modules", pkgName, "package.json");
      const m = JSON.parse(readFileSync(p, "utf8"));
      return { version: m.version || "", description: zh || m.description || "" };
    } catch {
      return { version: "", description: zh || "" };
    }
  }
  ctx.webServer.register({
    kind: "exact",
    path: "/api/skill-hub/plugins",
    handler(_req, res) {
      try {
        const { dir, manifest } = readProfileManifest();
        const deps = manifest.dependencies || {};
        const bundles = manifest.dsh?.profile?.bundles || [];
        const bundleSet = new Set(bundles);
        const installed = Object.keys(deps).filter((n) => n !== manifest.name).map((name2) => {
          const meta = readPluginMeta(dir, name2);
          return {
            name: name2,
            version: meta.version,
            description: meta.description,
            enabled: bundleSet.has(name2)
          };
        }).sort((a, b) => a.name.localeCompare(b.name));
        const enabledCount = installed.filter((p) => p.enabled).length;
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ installed, enabledCount, totalCount: installed.length }));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: String(error && error.message || error) }));
      }
    }
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/api/skill-hub/plugins/toggle",
    handler(req, res) {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        try {
          const { name: name2, enable } = JSON.parse(body || "{}");
          if (!name2 || typeof name2 !== "string") {
            res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: 'missing "name"' }));
            return;
          }
          const { pkgPath, manifest } = readProfileManifest();
          const bundles = manifest.dsh?.profile?.bundles;
          if (!Array.isArray(bundles)) {
            res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "profile has no dsh.profile.bundles array" }));
            return;
          }
          const idx = bundles.indexOf(name2);
          let changed = false;
          if (enable && idx === -1) {
            bundles.push(name2);
            changed = true;
          }
          if (!enable && idx !== -1) {
            bundles.splice(idx, 1);
            changed = true;
          }
          if (changed) {
            manifest.dsh.profile.bundles = bundles;
            writeFileSync(pkgPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
          }
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ name: name2, enabled: enable, changed, restartRequired: changed }));
        } catch (error) {
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: String(error && error.message || error) }));
        }
      });
    }
  });
  ctx.webServer.register({
    kind: "exact",
    path: "/api/skill-hub/restart",
    handler(_req, res) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ restarting: true }));
      setTimeout(() => process.exit(0), 300);
    }
  });
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
