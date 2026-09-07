"""Sync engine.

Rules (inherited from a setup running in production since 2026-08-14,
deliberately preserved):

* **Newer mtime wins** for two-way sync. No content merging, no guessing.
* **Never delete.** A skill that only exists on one agent stays there.
  There is deliberately no ``--mirror``: agents legitimately ship exclusive
  skills and silently deleting them would be destructive.
* **Never overwrite on conflict.** Ambiguous cases are reported, not resolved.
* **Skip client-managed metadata** so each client keeps its own state.

Performance note
----------------
Content hashing costs ~16 ms/file on a typical disk, so hashing every file in
every library takes minutes once you have a few hundred skills. Since we sync
with ``shutil.copy2`` (which preserves mtime), the pair ``(size, mtime_ns)``
is an excellent cheap fingerprint: identical after a sync, different when
someone edits a file. Therefore:

* default mode compares ``(size, mtime_ns)`` only -- a full status scan of
  ~3000 files x 6 libraries takes seconds instead of minutes;
* ``--deep`` additionally hashes file contents for a paranoid verification.
"""

from __future__ import annotations

import fnmatch
import hashlib
import os
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

HASH_CHUNK = 1 << 20


# --------------------------------------------------------------------------
# low-level helpers
# --------------------------------------------------------------------------
def file_hash(path: Path, chunk: int = HASH_CHUNK) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def stat_key(path: Path) -> Tuple[int, int]:
    """Cheap fingerprint: ``(size, mtime_ns)``."""
    try:
        st = path.stat()
        return (st.st_size, st.st_mtime_ns)
    except OSError:
        return (-1, -1)


def is_excluded(name: str, patterns: Iterable[str]) -> bool:
    return any(fnmatch.fnmatch(name, p) for p in patterns)


def iter_files(root: Path, excludes: Iterable[str]) -> List[Path]:
    """Regular files under *root*, as paths relative to *root*.

    Symlinks and Windows junctions are skipped: agents sometimes junction
    their skill dirs at each other and following them causes infinite walks
    or duplicate writes.
    """
    out: List[Path] = []
    if not root.is_dir():
        return out
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = [
            d
            for d in dirnames
            if not os.path.islink(os.path.join(dirpath, d))
            and not is_excluded(d, excludes)
        ]
        for fn in filenames:
            if is_excluded(fn, excludes):
                continue
            full = Path(dirpath) / fn
            if os.path.islink(full) or not full.is_file():
                continue
            out.append(full.relative_to(root))
    return out


def _copy(src: Path, dst: Path, dry_run: bool) -> bool:
    if dry_run:
        return True
    try:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        # copy2 usually preserves mtime, but not always to ns precision.
        # Force it so the next run sees the two files as identical.
        st = src.stat()
        os.utime(dst, ns=(st.st_atime_ns, st.st_mtime_ns))
        return True
    except (OSError, shutil.Error):
        return False


# --------------------------------------------------------------------------
# results
# --------------------------------------------------------------------------
@dataclass
class PairResult:
    a: Path
    b: Path
    copied_a_to_b: List[str] = field(default_factory=list)
    copied_b_to_a: List[str] = field(default_factory=list)
    failed: List[str] = field(default_factory=list)
    conflicts: List[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.copied_a_to_b) + len(self.copied_b_to_a)


# --------------------------------------------------------------------------
# two-way sync
# --------------------------------------------------------------------------
def sync_pair(
    a: Path,
    b: Path,
    excludes: Iterable[str],
    dry_run: bool = False,
    deep: bool = False,
) -> PairResult:
    """Incremental two-way sync between two libraries (newer mtime wins)."""
    res = PairResult(a=a, b=b)
    if not a.is_dir() or not b.is_dir():
        return res

    fa = {str(p): p for p in iter_files(a, excludes)}
    fb = {str(p): p for p in iter_files(b, excludes)}

    for rel in sorted(set(fa) | set(fb)):
        pa, pb = fa.get(rel), fb.get(rel)

        if pa and not pb:
            if _copy(a / pa, b / pa, dry_run):
                res.copied_a_to_b.append(rel)
            else:
                res.failed.append(rel)
            continue

        if pb and not pa:
            if _copy(b / pb, a / pb, dry_run):
                res.copied_b_to_a.append(rel)
            else:
                res.failed.append(rel)
            continue

        sa, sb = a / pa, b / pb  # type: ignore[index]
        ka, kb = stat_key(sa), stat_key(sb)

        if ka == kb:
            if deep and file_hash(sa) != file_hash(sb):
                # same size+mtime but different bytes -- genuinely ambiguous
                res.conflicts.append(rel)
            continue

        # size or mtime differs: newer mtime wins
        if ka[1] > kb[1]:
            if _copy(sa, sb, dry_run):
                res.copied_a_to_b.append(rel)
            else:
                res.failed.append(rel)
        elif kb[1] > ka[1]:
            if _copy(sb, sa, dry_run):
                res.copied_b_to_a.append(rel)
            else:
                res.failed.append(rel)
        else:
            # identical mtime, different size -> ambiguous, do not touch
            res.conflicts.append(rel)

    if not dry_run:
        for rel in sorted(set(fa) | set(fb)):
            pa, pb = a / rel, b / rel
            if pa.is_file() and pb.is_file() and stat_key(pa) != stat_key(pb):
                if rel not in res.conflicts:
                    res.conflicts.append(rel)
    return res


def sync_all(
    roots: List[Path],
    excludes: Iterable[str],
    dry_run: bool = False,
    deep: bool = False,
) -> List[PairResult]:
    results: List[PairResult] = []
    for i in range(len(roots)):
        for j in range(i + 1, len(roots)):
            results.append(
                sync_pair(roots[i], roots[j], excludes, dry_run=dry_run, deep=deep)
            )
    return results


# --------------------------------------------------------------------------
# one-way enforcement (--from)
# --------------------------------------------------------------------------
def enforce_from(
    source: Path,
    targets: List[Path],
    excludes: Iterable[str],
    dry_run: bool = False,
    backup: bool = True,
    deep: bool = False,
) -> Dict[str, List[str]]:
    """Force every target to match *source*.

    Anything about to be replaced is first copied to
    ``<file>.bak-skillsync-<ts>`` so nothing is lost even in this
    authoritative mode.
    """
    stamp = time.strftime("%Y%m%d-%H%M%S")
    out: Dict[str, List[str]] = {"copied": [], "backup": [], "failed": []}
    src_files = {str(p): p for p in iter_files(source, excludes)}

    for tgt in targets:
        if tgt.resolve() == source.resolve():
            continue
        for rel, relpath in sorted(src_files.items()):
            s, d = source / relpath, tgt / relpath
            if d.is_file():
                same = (
                    file_hash(d) == file_hash(s)
                    if deep
                    else stat_key(d) == stat_key(s)
                )
                if same:
                    continue
                if backup and not dry_run:
                    bak = d.with_suffix(d.suffix + f".bak-skillsync-{stamp}")
                    try:
                        shutil.copy2(d, bak)
                        out["backup"].append(str(bak))
                    except OSError:
                        pass
            if _copy(s, d, dry_run):
                out["copied"].append(str(d))
            else:
                out["failed"].append(str(d))
    return out


# --------------------------------------------------------------------------
# status, aggregated per SKILL (not per file -- 3000 files is not a report)
# --------------------------------------------------------------------------
def skill_dirs(root: Path) -> List[Path]:
    """Immediate sub-directories of a library that look like a skill."""
    if not root.is_dir():
        return []
    out = []
    try:
        for c in sorted(root.iterdir()):
            if not c.is_dir() or os.path.islink(c):
                continue
            out.append(c)
    except (PermissionError, OSError):
        pass
    return out


def skill_fingerprint(
    skill_dir: Path, excludes: Iterable[str], deep: bool = False
) -> str:
    """Fingerprint one skill directory.

    Cheap mode hashes the sorted ``(relpath, size, mtime_ns)`` list;
    ``deep`` hashes file contents instead.
    """
    h = hashlib.sha256()
    for rel in sorted(iter_files(skill_dir, excludes), key=str):
        full = skill_dir / rel
        h.update(str(rel).replace("\\", "/").encode("utf-8"))
        if deep:
            h.update(file_hash(full).encode("ascii"))
        else:
            h.update(str(stat_key(full)).encode("ascii"))
    return h.hexdigest()


def collect_status(
    roots: List[Path], excludes: Iterable[str], deep: bool = False
) -> Dict[str, Dict[str, Optional[str]]]:
    """``skill name -> {root: fingerprint | None}``."""
    table: Dict[str, Dict[str, Optional[str]]] = {}
    for root in roots:
        for sd in skill_dirs(root):
            table.setdefault(sd.name, {})
            table[sd.name][str(root)] = skill_fingerprint(sd, excludes, deep=deep)
    for name, per in table.items():
        for r in roots:
            per.setdefault(str(r), None)
    return table


def summarise(
    table: Dict[str, Dict[str, Optional[str]]]
) -> Tuple[List[str], List[str], List[str]]:
    """Return ``(consistent, partial, divergent)`` skill names.

    * consistent -- present everywhere with the same fingerprint
    * partial    -- missing on at least one end (not an error: an agent may
                    simply not have this skill; ``sync`` will propagate it)
    * divergent  -- present on 2+ ends but fingerprints differ (real drift)
    """
    consistent: List[str] = []
    partial: List[str] = []
    divergent: List[str] = []
    for name, per in sorted(table.items()):
        fps = {v for v in per.values() if v is not None}
        if not fps:
            continue
        if any(v is None for v in per.values()):
            partial.append(name)
        elif len(fps) > 1:
            divergent.append(name)
        else:
            consistent.append(name)
    return consistent, partial, divergent
