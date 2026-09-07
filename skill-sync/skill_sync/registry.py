"""Registry: the persisted list of skill libraries this machine syncs.

Stored at ``~/.skill-sync/registry.json``.  It is produced by the
``discover`` command (the "data collection" step) and can be edited by
hand or extended with ``add`` / ``remove``.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

REGISTRY_VERSION = 1

DEFAULT_EXCLUDES: List[str] = [
    # Client-managed metadata. Syncing these would clobber each client's own
    # enable/disable state, so they are never copied between agents.
    "*.bundled-hash",
    "_user_meta.json",
    "_bm_skillid_migration.json",
    "_bm_skillid_migration.json.fallback.bak",
    ".DS_Store",
    "__pycache__",
    "*.pyc",
]


def config_dir() -> Path:
    """``~/.skill-sync`` (override with ``SKILL_SYNC_HOME``)."""
    override = os.environ.get("SKILL_SYNC_HOME")
    base = Path(override) if override else Path.home() / ".skill-sync"
    base.mkdir(parents=True, exist_ok=True)
    return base


def registry_path() -> Path:
    return config_dir() / "registry.json"


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def load() -> Dict[str, Any]:
    """Load registry, returning an empty skeleton when it does not exist."""
    p = registry_path()
    if not p.is_file():
        return {
            "version": REGISTRY_VERSION,
            "agents": [],
            "exclude": list(DEFAULT_EXCLUDES),
            "created": _now(),
            "updated": _now(),
        }
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {
            "version": REGISTRY_VERSION,
            "agents": [],
            "exclude": list(DEFAULT_EXCLUDES),
            "created": _now(),
            "updated": _now(),
        }
    data.setdefault("version", REGISTRY_VERSION)
    data.setdefault("agents", [])
    data.setdefault("exclude", list(DEFAULT_EXCLUDES))
    data.setdefault("created", _now())
    data.setdefault("updated", _now())
    return data


def save(reg: Dict[str, Any]) -> Path:
    reg["version"] = REGISTRY_VERSION
    reg["updated"] = _now()
    p = registry_path()
    p.write_text(json.dumps(reg, indent=2, ensure_ascii=False), encoding="utf-8")
    return p


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def get_agents(reg: Dict[str, Any], only_enabled: bool = True) -> List[Dict[str, Any]]:
    agents = reg.get("agents", [])
    if only_enabled:
        agents = [a for a in agents if a.get("enabled", True)]
    return agents


def find_agent(reg: Dict[str, Any], key: str) -> Optional[Dict[str, Any]]:
    """Locate an agent by id, name or path (case-insensitive)."""
    k = str(key).lower()
    for a in reg.get("agents", []):
        if str(a.get("id", "")).lower() == k:
            return a
        if str(a.get("name", "")).lower() == k:
            return a
        if str(a.get("path", "")).lower() == k:
            return a
    return None


def upsert_agent(
    reg: Dict[str, Any],
    agent_id: str,
    name: str,
    path: Path,
    enabled: bool = True,
) -> Dict[str, Any]:
    """Insert or update an entry, preserving fields we do not manage."""
    p = str(Path(path).resolve())
    for a in reg.get("agents", []):
        if a.get("id") == agent_id or str(a.get("path", "")).lower() == p.lower():
            a["id"] = agent_id
            a["name"] = name
            a["path"] = p
            a["enabled"] = enabled
            return a
    entry = {
        "id": agent_id,
        "name": name,
        "path": p,
        "enabled": enabled,
        "added": _now(),
    }
    reg.setdefault("agents", []).append(entry)
    return entry


def remove_agent(reg: Dict[str, Any], key: str) -> bool:
    a = find_agent(reg, key)
    if not a:
        return False
    reg["agents"] = [x for x in reg.get("agents", []) if x is not a]
    return True


def excludes(reg: Dict[str, Any]) -> List[str]:
    return list(reg.get("exclude", DEFAULT_EXCLUDES))
