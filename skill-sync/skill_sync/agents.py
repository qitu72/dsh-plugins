"""Known AI-agent skill-library locations and auto-discovery.

Design notes
------------
Different people use different agents, so the skill directory of *their*
setup can never be hard-coded.  Instead we ship a catalogue of well-known
agents (``KNOWN_AGENTS``) and probe the filesystem for them at runtime.

The catalogue is intentionally data-driven: adding support for a new agent
is a one-line change here (or a JSON override in ``data/known_agents.json``),
no code change required.  Community contributions welcome.

Placeholders supported in ``path`` templates:
    {home}   -> user home directory
    {cwd}    -> current working directory
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

# --------------------------------------------------------------------------
# Catalogue of well-known agents.
#
# id        stable short identifier used in the registry
# name      human readable label
# path      skill library location template
# note      optional remark shown during discovery
# --------------------------------------------------------------------------
KNOWN_AGENTS: List[Dict[str, str]] = [
    {"id": "workbuddy", "name": "WorkBuddy", "path": "{home}/.workbuddy/skills"},
    {"id": "codebuddy", "name": "CodeBuddy", "path": "{home}/.codebuddy/skills"},
    {"id": "autoclaw", "name": "AutoClaw / OpenClaw", "path": "{home}/.openclaw-autoclaw/skills"},
    {"id": "dsh", "name": "DeepSeek Harness", "path": "{home}/.dsh/skills"},
    {"id": "claude-code", "name": "Claude Code", "path": "{home}/.claude/skills"},
    {"id": "codex", "name": "Codex CLI", "path": "{home}/.codex/skills"},
    {"id": "gemini-cli", "name": "Gemini CLI", "path": "{home}/.gemini/skills"},
    {"id": "cursor", "name": "Cursor", "path": "{home}/.cursor/skills"},
    {"id": "windsurf", "name": "Windsurf", "path": "{home}/.windsurf/skills"},
    {"id": "cline", "name": "Cline", "path": "{home}/.cline/skills"},
    {"id": "roo", "name": "Roo Code", "path": "{home}/.roo/skills"},
    {"id": "openclaw", "name": "OpenClaw (legacy name)", "path": "{home}/.openclaw/skills"},
]

# Project-local convention used by several agents: <project>/.agents/skills
PROJECT_LOCAL_TEMPLATES: List[str] = [
    "{cwd}/.agents/skills",
    "{cwd}/.claude/skills",
    "{cwd}/.codebuddy/skills",
    "{cwd}/.workbuddy/skills",
]


def expand_template(template: str) -> Path:
    """Expand ``{home}`` / ``{cwd}`` placeholders and normalise the path."""
    expanded = template.format(
        home=str(Path.home()),
        cwd=str(Path.cwd()),
    )
    return Path(os.path.expanduser(expanded)).resolve()


def _looks_like_skill_library(path: Path) -> bool:
    """Heuristic: a directory that already holds at least one skill folder.

    An empty directory is still reported as a *candidate* (the agent may be
    installed but unused); callers decide how to present it.
    """
    return path.is_dir()


def _count_skills(path: Path) -> int:
    """Count immediate sub-directories that contain a SKILL.md (or skill.md)."""
    if not path.is_dir():
        return 0
    n = 0
    try:
        for child in path.iterdir():
            if not child.is_dir():
                continue
            if (child / "SKILL.md").exists() or (child / "skill.md").exists():
                n += 1
    except (PermissionError, OSError):
        return 0
    return n


def load_overrides(data_dir: Optional[Path] = None) -> List[Dict[str, str]]:
    """Load user/community contributed agent definitions.

    Looks for ``data/known_agents.json`` next to the package (or at
    ``data_dir`` when given).  Missing / malformed files are ignored so the
    tool never breaks because of a bad contribution.
    """
    if data_dir is None:
        data_dir = Path(__file__).resolve().parent.parent / "data"
    target = data_dir / "known_agents.json"
    if not target.is_file():
        return []
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    if isinstance(payload, dict):
        payload = payload.get("agents", [])
    if not isinstance(payload, list):
        return []
    out: List[Dict[str, str]] = []
    for item in payload:
        if isinstance(item, dict) and item.get("id") and item.get("path"):
            out.append(
                {
                    "id": str(item["id"]),
                    "name": str(item.get("name", item["id"])),
                    "path": str(item["path"]),
                }
            )
    return out


def all_agent_defs(include_project_local: bool = True) -> List[Dict[str, str]]:
    """Built-in catalogue + JSON overrides (+ optional project-local probes)."""
    defs: List[Dict[str, str]] = list(KNOWN_AGENTS) + load_overrides()
    if include_project_local:
        defs += [
            {"id": f"project-{i}", "name": f"Project-local ({t})", "path": t}
            for i, t in enumerate(PROJECT_LOCAL_TEMPLATES)
        ]
    return defs


def discover(include_project_local: bool = True) -> List[Dict[str, Any]]:
    """Probe the filesystem and return candidate skill libraries.

    Each result::

        {
          "id": "workbuddy",
          "name": "WorkBuddy",
          "path": Path(...),
          "exists": True,
          "skills": 42,
        }
    """
    results: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for d in all_agent_defs(include_project_local=include_project_local):
        p = expand_template(d["path"])
        key = str(p).lower()
        if key in seen:  # de-dupe (e.g. alias agents resolving to same dir)
            continue
        seen.add(key)
        exists = _looks_like_skill_library(p)
        results.append(
            {
                "id": d["id"],
                "name": d["name"],
                "path": p,
                "exists": exists,
                "skills": _count_skills(p) if exists else 0,
            }
        )
    return results
