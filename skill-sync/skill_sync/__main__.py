"""Allow ``python -m skill_sync`` as a zero-install entry point."""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
