// src/index.js
import { readdirSync, readFileSync, statSync } from "node:fs";
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
function apply(ctx) {
  ctx.webServer.register({
    kind: "exact",
    path: "/api/skill-hub/list",
    handler(_req, res) {
      const roots = [
        { id: "dsh", label: "DeepSeek Harness", path: join(homedir(), ".dsh", "skills") },
        { id: "codebuddy", label: "CodeBuddy", path: join(homedir(), ".codebuddy", "skills") },
        { id: "workbuddy", label: "WorkBuddy", path: join(homedir(), ".workbuddy", "skills") }
      ];
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
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
