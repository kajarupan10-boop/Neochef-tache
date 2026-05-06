#!/usr/bin/env python3
"""Met à jour app.json (themeColor, splash, backgroundColor) et index.tsx
(DEFAULT_PRIMARY/SECONDARY) pour différencier visuellement les 3 apps."""
import json
import re
from pathlib import Path

APPS = {
    "neochef-taches": {
        "primary": "#2C5F2D",
        "primary_dark": "#1F4220",
        "secondary": "#EAE6CA",
    },
    "neochef-menu": {
        "primary": "#C97B2A",
        "primary_dark": "#8E561D",
        "secondary": "#FAF3E5",
    },
    "neochef-events": {
        "primary": "#6B4CA3",
        "primary_dark": "#4A3373",
        "secondary": "#F0EBF7",
    },
}

APPS_ROOT = Path("/app/apps")

def patch_app_json(app_dir: str, cfg: dict):
    f = APPS_ROOT / app_dir / "app.json"
    data = json.loads(f.read_text(encoding="utf-8"))
    expo = data["expo"]

    # Web theme
    if "web" in expo:
        expo["web"]["themeColor"] = cfg["primary"]
        expo["web"]["backgroundColor"] = cfg["primary_dark"]

    # Splash screen
    for plugin in expo.get("plugins", []):
        if isinstance(plugin, list) and plugin and plugin[0] == "expo-splash-screen":
            plugin[1]["backgroundColor"] = cfg["primary_dark"]

    f.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  [ok] {app_dir}/app.json")

def patch_index_tsx(app_dir: str, cfg: dict):
    f = APPS_ROOT / app_dir / "app" / "index.tsx"
    content = f.read_text(encoding="utf-8")
    new_content = re.sub(
        r"const DEFAULT_PRIMARY = '#[0-9A-Fa-f]+';",
        f"const DEFAULT_PRIMARY = '{cfg['primary']}';",
        content,
        count=1,
    )
    new_content = re.sub(
        r"const DEFAULT_SECONDARY = '#[0-9A-Fa-f]+';",
        f"const DEFAULT_SECONDARY = '{cfg['secondary']}';",
        new_content,
        count=1,
    )
    if new_content != content:
        f.write_text(new_content, encoding="utf-8")
        print(f"  [ok] {app_dir}/app/index.tsx (DEFAULT_PRIMARY={cfg['primary']})")
    else:
        print(f"  [warn] {app_dir}/app/index.tsx: aucune modification")

def main():
    for app, cfg in APPS.items():
        print(f"\n=== {app} ===")
        patch_app_json(app, cfg)
        patch_index_tsx(app, cfg)

if __name__ == "__main__":
    main()
