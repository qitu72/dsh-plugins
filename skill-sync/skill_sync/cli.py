"""Command line interface for skill-sync."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import agents as agents_mod
from . import registry as registry_mod
from . import sync as sync_mod

VERSION = "0.1.0"


# --------------------------------------------------------------------------
# output helpers
# --------------------------------------------------------------------------
def _ok(msg: str) -> None:
    print(f"  [ok]   {msg}")


def _warn(msg: str) -> None:
    print(f"  [warn] {msg}")


def _err(msg: str) -> None:
    print(f"  [ERR]  {msg}", file=sys.stderr)


def _head(msg: str) -> None:
    print(f"\n== {msg} ==")


def _roots(reg: Dict[str, Any]) -> List[Path]:
    return [Path(a["path"]).resolve() for a in registry_mod.get_agents(reg)]


def _require_roots(reg: Dict[str, Any], min_n: int = 2) -> List[Path]:
    roots = [r for r in _roots(reg) if r.is_dir()]
    if len(roots) < min_n:
        _err(
            f"registry has {len(roots)} usable librar(y/ies); need at least {min_n}. "
            "Run `skill-sync discover` first."
        )
        raise SystemExit(2)
    return roots


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------
def cmd_discover(args: argparse.Namespace) -> int:
    """Data-collection step: probe the machine for agent skill libraries."""
    reg = registry_mod.load()
    _head("Discovering agent skill libraries")
    found = agents_mod.discover(include_project_local=not args.no_project_local)

    existing = [f for f in found if f["exists"]]
    if not existing:
        _warn("No known agent skill library found on this machine.")
        _warn("Add one manually with:  skill-sync add <path> --name <label>")
        return 1

    print(f"  {'#':<3} {'agent':<28} {'skills':>6}  path")
    for i, f in enumerate(existing, 1):
        print(f"  {i:<3} {f['name']:<28} {f['skills']:>6}  {f['path']}")

    selected: List[Dict[str, Any]] = existing
    if not args.yes:
        _head("Select libraries to sync")
        print("  Enter numbers separated by commas, 'a' for all, or 'q' to abort.")
        try:
            raw = input("  > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return 1
        if raw in ("q", "quit", "exit"):
            return 1
        if raw not in ("a", "all", ""):
            picked: List[Dict[str, Any]] = []
            for tok in raw.replace(" ", "").split(","):
                if tok.isdigit() and 1 <= int(tok) <= len(existing):
                    picked.append(existing[int(tok) - 1])
            if not picked:
                _warn("nothing selected")
                return 1
            selected = picked
        else:
            selected = existing

    for f in selected:
        registry_mod.upsert_agent(reg, f["id"], f["name"], f["path"], enabled=True)
    path = registry_mod.save(reg)
    _head("Registry written")
    _ok(f"{len(selected)} librar(y/ies) registered -> {path}")
    _ok("Next: `skill-sync status` to see drift, `skill-sync sync` to sync.")
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    reg = registry_mod.load()
    p = Path(args.path).expanduser().resolve()
    if not p.is_dir():
        _err(f"not a directory: {p}")
        return 1
    name = args.name or p.parent.name or p.name
    aid = args.id or p.name.lower().replace(" ", "-")
    registry_mod.upsert_agent(reg, aid, name, p, enabled=True)
    registry_mod.save(reg)
    _ok(f"registered: {name} ({aid}) -> {p}")
    return 0


def cmd_remove(args: argparse.Namespace) -> int:
    reg = registry_mod.load()
    if registry_mod.remove_agent(reg, args.key):
        registry_mod.save(reg)
        _ok(f"removed: {args.key}")
        return 0
    _err(f"not found in registry: {args.key}")
    return 1


def cmd_list(args: argparse.Namespace) -> int:
    reg = registry_mod.load()
    entries = registry_mod.get_agents(reg, only_enabled=False)
    _head(f"Registered skill libraries ({len(entries)})")
    if not entries:
        _warn("registry is empty -- run `skill-sync discover`")
        return 1
    for a in entries:
        p = Path(a["path"])
        state = "ok " if p.is_dir() else "MISSING"
        flag = "" if a.get("enabled", True) else "  (disabled)"
        n = sum(
            1
            for c in (p.iterdir() if p.is_dir() else [])
            if c.is_dir() and ((c / "SKILL.md").exists() or (c / "skill.md").exists())
        )
        print(f"  [{state}] {a['name']:<28} {n:>4} skills  {a['path']}{flag}")
    print(f"\n  registry: {registry_mod.registry_path()}")
    return 0


def _skill_count(p: Path) -> int:
    if not p.is_dir():
        return -1
    try:
        return sum(1 for d in sync_mod.skill_dirs(p))
    except OSError:
        return -1


def cmd_enable(args: argparse.Namespace) -> int:
    reg = registry_mod.load()
    a = registry_mod.find_agent(reg, args.key)
    if not a:
        _err(f"not found in registry: {args.key}")
        return 1
    a["enabled"] = True
    registry_mod.save(reg)
    _ok(f"enabled: {a['name']}")
    return 0


def cmd_disable(args: argparse.Namespace) -> int:
    reg = registry_mod.load()
    a = registry_mod.find_agent(reg, args.key)
    if not a:
        _err(f"not found in registry: {args.key}")
        return 1
    a["enabled"] = False
    registry_mod.save(reg)
    _ok(f"disabled: {a['name']}  (files untouched; excluded from sync)")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    reg = registry_mod.load()
    roots = _require_roots(reg)
    excl = registry_mod.excludes(reg)
    _head(f"Status across {len(roots)} libraries")
    counts = {}
    for r in roots:
        n = _skill_count(r)
        counts[str(r)] = n
        print(f"  {n:>5} skills  {r}")

    live = [c for c in counts.values() if c > 0]
    if live:
        median = sorted(live)[len(live) // 2]
        thin = [(r, c) for r, c in counts.items() if 0 <= c < median * 0.5]
        if thin:
            _warn("these libraries hold far fewer skills than the others --")
            for r, c in thin:
                print(f"          {c} skills  {r}")
            _warn("if they are not real sync targets:  skill-sync disable <id>")

    table = sync_mod.collect_status(roots, excl, deep=args.deep)
    ok, partial, divergent = sync_mod.summarise(table)

    mode = "deep (content hashes)" if args.deep else "quick (size+mtime)"
    print(f"  mode: {mode}\n")
    print(f"  skills total  : {len(table)}")
    print(f"  consistent    : {len(ok)}")
    print(f"  partial       : {len(partial)}   (absent on at least one end)")
    print(f"  divergent     : {len(divergent)}   (present on 2+ ends, differs)")

    if partial:
        _head(f"Partial -- absent on some end ({len(partial)})")
        if args.verbose:
            for name in partial:
                where = [Path(r).name for r, v in table[name].items() if v is None]
                print(f"  - {name}   (absent: {', '.join(where)})")
        else:
            print("  " + ", ".join(partial[:20]) + (" ..." if len(partial) > 20 else ""))
            print("  (use -v for details)")

    if divergent:
        _head(f"DIVERGENT -- same skill, different content ({len(divergent)})")
        for name in divergent:
            print(f"  - {name}")
            if args.verbose:
                for r, v in table[name].items():
                    mark = "absent" if v is None else v[:12]
                    print(f"        {Path(r).name:<24} {mark}")
        _warn("Run `skill-sync sync` (newer mtime wins) or `sync --from <id>` to force one side.")

    if not divergent:
        _ok("no divergent skills")
    return 0 if not divergent else 1


def cmd_sync(args: argparse.Namespace) -> int:
    reg = registry_mod.load()
    roots = _require_roots(reg)
    excl = registry_mod.excludes(reg)
    dry = args.dry_run

    if args.source:
        src_a = registry_mod.find_agent(reg, args.source)
        if not src_a:
            _err(f"unknown source: {args.source}")
            return 2
        src = Path(src_a["path"]).resolve()
        targets = [r for r in roots if r.resolve() != src.resolve()]
        _head(f"One-way sync FROM {src_a['name']}")
        print(f"  source : {src}")
        for t in targets:
            print(f"  target : {t}")
        res = sync_mod.enforce_from(
            src, targets, excl, dry_run=dry, backup=not args.no_backup, deep=args.deep
        )
        _head("Result")
        print(f"  copied        : {len(res['copied'])}")
        print(f"  backups made  : {len(res['backup'])}")
        print(f"  failed        : {len(res['failed'])}")
        if dry:
            _warn("dry run -- nothing was written")
        for f in res["failed"][:20]:
            _err(f"failed: {f}")
        return 1 if res["failed"] else 0

    _head(f"Two-way sync across {len(roots)} libraries (newer mtime wins)")
    if dry:
        _warn("dry run -- nothing will be written")
    results = sync_mod.sync_all(roots, excl, dry_run=dry, deep=args.deep)

    total = 0
    conflicts: List[str] = []
    for r in results:
        total += r.total
        if r.total or r.conflicts or r.failed:
            print(
                f"\n  {Path(r.a).name} <-> {Path(r.b).name}: "
                f"+{len(r.copied_a_to_b)} / -{len(r.copied_b_to_a)}"
            )
            for rel in r.copied_a_to_b[:10]:
                print(f"      -> {rel}")
            for rel in r.copied_b_to_a[:10]:
                print(f"      <- {rel}")
        for f in r.failed:
            _err(f"failed: {f}")
        conflicts.extend(f"{Path(r.a).name}|{Path(r.b).name}|{c}" for c in r.conflicts)

    _head("Done")
    print(f"  files copied : {total}")
    if dry:
        _warn("dry run -- nothing was written")
    if conflicts:
        _head("CONFLICTS -- not overwritten, resolve by hand")
        for c in dict.fromkeys(conflicts):
            print(f"  - {c}")
        _warn("These files still differ after sync (same mtime, different content).")
        return 1
    _ok("all libraries consistent")
    return 0


# --------------------------------------------------------------------------
# parser
# --------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="skill-sync",
        description="Keep one skill library in sync across many AI agents.",
    )
    p.add_argument("--version", action="version", version=f"skill-sync {VERSION}")
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("discover", help="probe this machine for agent skill libraries")
    d.add_argument("-y", "--yes", action="store_true", help="accept all discovered")
    d.add_argument("--no-project-local", action="store_true", help="skip <cwd>/.agents probes")
    d.set_defaults(func=cmd_discover)

    a = sub.add_parser("add", help="register a skill library path")
    a.add_argument("path")
    a.add_argument("--name", help="human readable label")
    a.add_argument("--id", help="stable identifier")
    a.set_defaults(func=cmd_add)

    rm = sub.add_parser("remove", help="unregister by id/name/path")
    rm.add_argument("key")
    rm.set_defaults(func=cmd_remove)

    ls = sub.add_parser("list", help="show registered libraries")
    ls.set_defaults(func=cmd_list)

    en = sub.add_parser("enable", help="re-include a library in sync")
    en.add_argument("key")
    en.set_defaults(func=cmd_enable)

    dis = sub.add_parser("disable", help="exclude a library from sync (files untouched)")
    dis.add_argument("key")
    dis.set_defaults(func=cmd_disable)

    st = sub.add_parser("status", help="report drift without changing anything")
    st.add_argument("-v", "--verbose", action="store_true")
    st.add_argument(
        "--deep",
        action="store_true",
        help="hash file contents instead of comparing size+mtime (slower, stricter)",
    )
    st.set_defaults(func=cmd_status)

    sy = sub.add_parser("sync", help="sync registered libraries")
    sy.add_argument("--dry-run", action="store_true", help="show what would change")
    sy.add_argument("--from", dest="source", help="one-way: force this library onto the others")
    sy.add_argument("--no-backup", action="store_true", help="skip .bak copies in --from mode")
    sy.add_argument(
        "--deep",
        action="store_true",
        help="hash file contents instead of comparing size+mtime (slower, stricter)",
    )
    sy.set_defaults(func=cmd_sync)

    return p


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
