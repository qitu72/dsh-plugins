---
name: skills-sync
description: >
  Multi-agent skill-library sync. Trigger when the user says "sync skills" /
  "同步技能库" / "同步skills", after you create or modify any SKILL.md or its
  companion files in one agent, at session start, or when the user suspects a
  skill is missing or stale on another agent. Keeps every installed AI agent's
  skill library consistent without manual copying.
---

# skills-sync · Keep every agent's skill library in sync

One machine, many AI agents, each with its **own** skill directory. The same
`SKILL.md` therefore exists as N copies; editing one leaves the others stale.
This skill turns "keep them consistent" into one command.

## When to trigger

1. **Session start** — run `status`; if drift is reported, tell the user.
2. User says **"sync skills" / "同步技能库" / "同步skills"**.
3. **After creating or modifying** any `SKILL.md` or companion file in any
   agent — sync before you finish the turn.
4. User reports a skill **missing or outdated** on some agent.

## Commands

```bash
# inspect first (read-only, changes nothing)
skill-sync status
skill-sync status -v          # also list files missing on some end

# sync (two-way, newer mtime wins)
skill-sync sync --dry-run     # ALWAYS dry-run first
skill-sync sync

# force one library onto the others (backs up what it replaces)
skill-sync sync --from <agent-id>
```

Not installed yet? Zero-install equivalent from a clone:

```bash
python -m skill_sync status
python -m skill_sync sync --dry-run
python -m skill_sync sync
```

First time on a machine, run `skill-sync discover` (interactive: detects which
agents are installed and writes `~/.skill-sync/registry.json`). If a library is
not detected, register it by hand: `skill-sync add <path> --name "<label>"`.

## Sync rules — do not violate these

- **Newer mtime wins** for two-way sync. No content merging.
- **Never delete.** A skill that exists on only one agent stays there. Do not
  "clean up" libraries by deleting; agents legitimately ship exclusive skills.
- **Conflicts are never auto-resolved.** If `sync` reports conflicts, stop and
  report them to the user with the file paths and hashes. Do not pick a winner
  on your own. Use `--from` only when the user explicitly says which side wins.
- **Client metadata is skipped** (`*.bundled-hash`, `_user_meta.json`,
  `_bm_skillid_migration.json*`) so each client keeps its own enable state.

## Wrap-up checklist

After syncing, confirm the libraries are consistent:

```bash
skill-sync status   # expect: "all libraries consistent", divergent = 0
```

If `status` still reports divergent files, report them to the user rather than
forcing a resolution. Note that agents load skills at startup, so other agents
will pick up the new content on their **next session**, not instantly.
