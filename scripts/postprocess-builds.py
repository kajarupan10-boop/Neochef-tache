#!/usr/bin/env python3
"""
Post-process each Expo web build inside /app/frontend/build/<app>/index.html:
  1. Strip the service-worker registration <script> block (avoids cross-app SW contamination
     since Expo hardcodes register('/sw.js') at site root).
  2. Rewrite the absolute-root asset refs that Expo forgot to prefix with baseUrl:
       href="/manifest.json"           -> href="/<app>/manifest.json"
       href="/apple-touch-icon*.png"   -> href="/<app>/apple-touch-icon*.png"

Idempotent: safe to run multiple times.
"""
import re
import sys
from pathlib import Path

BUILD_DIR = Path("/app/frontend/build")
APPS = ["taches", "menu", "events"]

SW_BLOCK_RE = re.compile(
    r"<script[^>]*>\s*if\s*\(\s*['\"]serviceWorker['\"].*?</script>",
    re.DOTALL,
)


def process(app: str) -> None:
    idx = BUILD_DIR / app / "index.html"
    if not idx.exists():
        print(f"[skip] {idx} (missing)")
        return

    html = idx.read_text(encoding="utf-8")
    before = len(html)
    changes = []

    # 1. remove SW registration
    new_html, n = SW_BLOCK_RE.subn("", html)
    if n:
        changes.append(f"stripped {n} SW script block(s)")
    html = new_html

    # 2. rewrite manifest + apple icons + any other bare-root refs Expo missed
    #    (we do NOT touch /_expo/... nor /taches/... refs — those are already correct)
    for pattern, repl in [
        (r'href="/manifest\.json"',              f'href="/{app}/manifest.json"'),
        (r'href="/apple-touch-icon\.png"',       f'href="/{app}/apple-touch-icon.png"'),
        (r'href="/apple-touch-icon-180x180\.png"', f'href="/{app}/apple-touch-icon-180x180.png"'),
    ]:
        html, n = re.subn(pattern, repl, html)
        if n:
            label = pattern.split('/')[-1].replace('\\', '').replace('"', '')
            changes.append(f"rewrote {n}x {label}")

    if changes:
        idx.write_text(html, encoding="utf-8")
        print(f"[ok] {app}: {', '.join(changes)} ({before} -> {len(html)} bytes)")
    else:
        print(f"[skip] {app}: nothing to change")


def main() -> int:
    if not BUILD_DIR.exists():
        print(f"ERROR: {BUILD_DIR} does not exist. Run yarn build first.", file=sys.stderr)
        return 1
    for a in APPS:
        process(a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
