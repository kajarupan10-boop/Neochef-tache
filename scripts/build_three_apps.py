#!/usr/bin/env python3
"""
Génère les 3 apps NeoChef distinctes à partir du monolithe.

Chaque app :
- Configure app.json (nom, bundle ID, slug)
- Stub les écrans non pertinents dans index.tsx
- Ajuste la navigation

Usage : python3 scripts/build_three_apps.py [tasks|events|all]
"""
import re
import shutil
import sys
from pathlib import Path

SOURCE = Path("/app/temp_clone/frontend")
APPS_ROOT = Path("/app/apps")

# Définition des 3 apps
APPS = {
    "menu": {
        "name": "NeoChef Menu",
        "slug": "neochef-menu",
        "scheme": "neochefmenu",
        "bundle_id": "com.neochef.menu",
        "description": "Gestion des menus restaurant",
        "default_screen": "menuRestaurant",
        # Écrans conservés: Menu Restaurant + Draft + Fiche Technique + Rapport Ardoise
        # + Menu Client (public) + Login + Settings + Users + History
        "stub_screens": [
            "DailyTasksScreen",
            "PrepareTasksScreen",
            "TaskTemplatesScreen",
            "PrestatairesScreen",
            "PermanentTasksScreen",
            "MenuGroupeScreen",
            "CreateGroupScreen",
            "StaffGroupViewScreen",
            "PublicGroupRequestScreen",
            "TrackGroupReservationScreen",
            "OrderPreparationScreen",
            "EventsScreen",
            "FacturationScreen",
        ],
    },
    "taches": {
        "name": "NeoChef Tâches",
        "slug": "neochef-taches",
        "scheme": "neocheftaches",
        "bundle_id": "com.neochef.taches",
        "description": "Gestion des tâches et préparation de commande",
        "default_screen": "daily",
        # Écrans conservés: Daily + Prepare + Templates + Categories + Permanent
        # + OrderPreparation + Users + Settings + History + Login
        "stub_screens": [
            "PrestatairesScreen",
            "MenuGroupeScreen",
            "CreateGroupScreen",
            "StaffGroupViewScreen",
            "PublicGroupRequestScreen",
            "TrackGroupReservationScreen",
            "FicheTechniqueScreen",
            "MenuRestaurantScreen",
            "MenuRestaurantDraftScreen",
            "EventsScreen",
            "FacturationScreen",
            "RapportArdoiseScreen",
            "PublicMenuScreen",
            "ClientMenuSelectionScreen",
        ],
    },
    "events": {
        "name": "NeoChef Events",
        "slug": "neochef-events",
        "scheme": "neochefevents",
        "bundle_id": "com.neochef.events",
        "description": "Gestion des événements, facturation et prestataires",
        "default_screen": "events",
        # Écrans conservés: Events + Facturation + MenuGroupe + CreateGroup
        # + Prestataires + StaffGroupView + PublicGroupRequest + TrackGroupReservation
        # + Users + Settings + History + Login
        "stub_screens": [
            "DailyTasksScreen",
            "PrepareTasksScreen",
            "TaskTemplatesScreen",
            "PermanentTasksScreen",
            "OrderPreparationScreen",
            "FicheTechniqueScreen",
            "MenuRestaurantScreen",
            "MenuRestaurantDraftScreen",
            "RapportArdoiseScreen",
            "PublicMenuScreen",
            "ClientMenuSelectionScreen",
        ],
    },
}

def copy_project(app_key: str, app_dir: Path):
    """Copie le monolithe source vers le dossier app (sans node_modules)."""
    if app_dir.exists():
        shutil.rmtree(app_dir)
    app_dir.mkdir(parents=True)
    # Utilise rsync pour la rapidité
    import subprocess
    subprocess.run([
        "rsync", "-a",
        "--exclude=node_modules",
        "--exclude=.expo",
        "--exclude=dist",
        "--exclude=dist-new",
        "--exclude=dist-test",
        "--exclude=build",
        "--exclude=.metro-cache",
        "--exclude=.screenshots",
        "--exclude=index.tsx.backup",
        f"{SOURCE}/",
        f"{app_dir}/",
    ], check=True)
    # Supprime les fichiers corrompus éventuels
    for p in app_dir.iterdir():
        if "@@" in p.name or p.name.startswith("\u0000"):
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
            else:
                p.unlink(missing_ok=True)

def write_app_json(cfg: dict, app_dir: Path):
    content = f'''{{
  "expo": {{
    "name": "{cfg['name']}",
    "slug": "{cfg['slug']}",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "{cfg['scheme']}",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "owner": "nagaratnam",
    "ios": {{
      "supportsTablet": true,
      "bundleIdentifier": "{cfg['bundle_id']}",
      "buildNumber": "1",
      "infoPlist": {{
        "NSCameraUsageDescription": "Scanner les QR codes clients",
        "ITSAppUsesNonExemptEncryption": false
      }}
    }},
    "android": {{
      "package": "{cfg['bundle_id']}",
      "versionCode": 1,
      "adaptiveIcon": {{
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#26252D"
      }},
      "edgeToEdgeEnabled": true,
      "permissions": [
        "android.permission.CAMERA",
        "android.permission.INTERNET"
      ]
    }},
    "web": {{
      "bundler": "metro",
      "output": "static",
      "favicon": "./assets/images/logo.png",
      "themeColor": "#2c5f2d",
      "backgroundColor": "#2c5f2d",
      "display": "standalone",
      "orientation": "portrait",
      "startUrl": "/",
      "name": "{cfg['name']}",
      "shortName": "{cfg['name']}",
      "description": "{cfg['description']}",
      "icons": [
        {{ "src": "./assets/images/logo.png", "sizes": "192x192", "type": "image/png" }},
        {{ "src": "./assets/images/icon.png", "sizes": "512x512", "type": "image/png" }}
      ],
      "meta": {{
        "apple-mobile-web-app-capable": "yes",
        "apple-mobile-web-app-status-bar-style": "black-translucent",
        "viewport": "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
      }}
    }},
    "plugins": [
      "expo-router",
      ["expo-font", {{ "fonts": ["./assets/fonts/SpaceMono-Regular.ttf"] }}],
      ["expo-splash-screen", {{
        "image": "./assets/images/icon.png",
        "imageWidth": 200,
        "resizeMode": "contain",
        "backgroundColor": "#000000"
      }}]
    ],
    "experiments": {{ "typedRoutes": true }},
    "extra": {{
      "eas": {{}},
      "router": {{}},
      "EXPO_BACKEND_URL": "https://ios-pdf-repair.preview.emergentagent.com"
    }}
  }}
}}
'''
    (app_dir / "app.json").write_text(content, encoding="utf-8")

def patch_package_json(cfg: dict, app_dir: Path):
    pkg = app_dir / "package.json"
    txt = pkg.read_text(encoding="utf-8")
    txt = re.sub(r'"name":\s*"[^"]+"', f'"name": "{cfg["slug"]}"', txt, count=1)
    pkg.write_text(txt, encoding="utf-8")

def stub_screens(cfg: dict, app_dir: Path):
    idx = app_dir / "app" / "index.tsx"
    lines = idx.read_text(encoding="utf-8").splitlines(keepends=True)

    func_re = re.compile(r"^\s*function\s+(\w+)\s*\(")
    ranges_to_stub = []

    for target in cfg["stub_screens"]:
        start = None
        for i, ln in enumerate(lines):
            m = func_re.match(ln)
            if m and m.group(1) == target:
                start = i
                break
        if start is None:
            print(f"[warn]   {target}: introuvable")
            continue

        # Trouve la signature complète: lire jusqu'à la ligne qui contient `}) {`
        # (fin de destructuration + début de corps), ou simplement `) {`
        sig_end = start
        for j in range(start, min(start + 30, len(lines))):
            if re.search(r"\)\s*\{?\s*$", lines[j]) and not lines[j].rstrip().endswith(","):
                # Accepter `: any) => {` ou `) {` ou `)`
                if re.search(r"\)\s*\{\s*$", lines[j]) or \
                   (re.search(r"\)\s*$", lines[j]) and j + 1 < len(lines) and lines[j+1].strip() == "{"):
                    sig_end = j
                    break
                if re.search(r"\}\)\s*\{\s*$", lines[j]):
                    sig_end = j
                    break
        # Trouve la fin de la fonction: première ligne `}` en colonne 0 APRÈS la fin de signature
        end = None
        for j in range(sig_end + 1, len(lines)):
            if lines[j].startswith("}") and not lines[j].startswith("})"):
                end = j
                break
        if end is None:
            print(f"[warn]   {target}: fin introuvable")
            continue
        ranges_to_stub.append((start, end, target))

    ranges_to_stub.sort(key=lambda x: x[0], reverse=True)
    for start, end, target in ranges_to_stub:
        stub = f"function {target}(_props: any) {{ return null as any; }}\n"
        lines[start : end + 1] = [stub]
        print(f"[ok]   {target}: stubbed (lignes {start+1}→{end+1})")

    content = "".join(lines)

    # Change l'écran par défaut
    content = re.sub(
        r"useState<('[^']+'(?:\s*\|\s*'[^']+')*)>\('daily'\)",
        f"useState<\\1>('{cfg['default_screen']}')",
        content,
        count=1,
    )

    idx.write_text(content, encoding="utf-8")
    total = content.count("\n")
    print(f"[stat] {cfg['slug']}: {total} lignes (monolithe: 27238)")

def build_app(app_key: str):
    if app_key not in APPS:
        print(f"[error] app inconnue: {app_key}")
        return
    cfg = APPS[app_key]
    app_dir = APPS_ROOT / f"neochef-{app_key}"
    print(f"\n=== Construction de {cfg['name']} → {app_dir} ===")
    copy_project(app_key, app_dir)
    write_app_json(cfg, app_dir)
    patch_package_json(cfg, app_dir)
    stub_screens(cfg, app_dir)
    print(f"[done] {cfg['name']} généré à {app_dir}")

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    if target == "all":
        for key in APPS:
            build_app(key)
    else:
        build_app(target)

if __name__ == "__main__":
    main()
