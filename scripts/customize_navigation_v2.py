#!/usr/bin/env python3
"""
Personnalisation v2 : approche ligne-par-ligne pour masquer les items
de navigation en se basant sur les data-testid.
"""
import re
from pathlib import Path

APPS_ROOT = Path("/app/apps")

APPS_CONFIG = {
    "neochef-taches": {
        "hidden_sidebar": [
            "menu-item-menu-restaurant",
            "menu-item-menu-restaurant-draft",
            "menu-item-menu-client",
            "menu-item-fiche-technique",
            "menu-item-groupe",
            "menu-item-events",
            "menu-item-facturation",
            "menu-item-rapport-ardoise",
            "menu-item-prestataires",
        ],
        "hide_settings_prestataires": True,
        "hide_settings_history": False,
        "hide_bottom_nav": False,
    },
    "neochef-events": {
        "hidden_sidebar": [
            "menu-item-tasks",
            "menu-item-order-prep",
            "menu-item-menu-restaurant",
            "menu-item-menu-restaurant-draft",
            "menu-item-menu-client",
            "menu-item-fiche-technique",
            "menu-item-rapport-ardoise",
        ],
        "hide_settings_prestataires": False,
        "hide_settings_history": True,
        "hide_bottom_nav": True,
    },
}

def hide_sidebar_block(lines: list[str], testid: str) -> tuple[list[str], bool]:
    """Trouve le bloc TouchableOpacity contenant le data-testid donné dans la
    sidebar manager menu, et le remplace par un commentaire. Le bloc est
    encadré par `{(condition) && (` et `)}`."""
    target = f'data-testid="{testid}"'
    target_idx = None
    for i, ln in enumerate(lines):
        if target in ln:
            target_idx = i
            break
    if target_idx is None:
        return lines, False

    # Walk backward to find line with `&& (` (the JSX conditional opening)
    start = None
    for i in range(target_idx - 1, max(target_idx - 15, -1), -1):
        if "&& (" in lines[i]:
            # Look one line above for `{(condition)` opening (not always present)
            start = i
            # Check if the conditional is on same or previous line
            stripped = lines[i].strip()
            if stripped.startswith("{") and "&& (" in stripped:
                start = i
            else:
                # Conditional spans multiple lines, walk back further to find `{(`
                for k in range(i, max(i - 5, -1), -1):
                    if lines[k].strip().startswith("{"):
                        start = k
                        break
            break
    if start is None:
        return lines, False

    # Walk forward to find `)}` after `</TouchableOpacity>`
    end = None
    for j in range(target_idx, min(target_idx + 25, len(lines))):
        if "</TouchableOpacity>" in lines[j]:
            # Check if next line has `)}` or current line ends with it
            for k in range(j, min(j + 4, len(lines))):
                if ")}" in lines[k]:
                    end = k
                    break
            break
    if end is None:
        return lines, False

    indent = " " * (len(lines[start]) - len(lines[start].lstrip()))
    replacement = f"{indent}{{/* [APP-FILTER] {testid} masqué */}}\n"
    new_lines = lines[:start] + [replacement] + lines[end + 1 :]
    return new_lines, True

def hide_settings_item(lines: list[str], target_screen: str) -> tuple[list[str], bool]:
    """Masque un TouchableOpacity du settings dropdown qui appelle setCurrentScreen('target_screen')."""
    target = f"setCurrentScreen('{target_screen}')"
    # On cherche d'abord la ligne contenant 'styles.settingsDropdownItem' qui précède
    # un onPress avec setCurrentScreen('target_screen')
    for i, ln in enumerate(lines):
        if target in ln and i > 0:
            # Vérifie que c'est dans un settings dropdown : remonte trouver `styles.settingsDropdownItem`
            is_settings = False
            start = None
            for k in range(i - 1, max(i - 6, -1), -1):
                if "styles.settingsDropdownItem" in lines[k]:
                    is_settings = True
                if "<TouchableOpacity" in lines[k]:
                    start = k
                    break
            if not is_settings or start is None:
                continue
            # find closing </TouchableOpacity>
            end = None
            for j in range(i, min(i + 15, len(lines))):
                if "</TouchableOpacity>" in lines[j]:
                    end = j
                    break
            if end is None:
                continue
            indent = " " * (len(lines[start]) - len(lines[start].lstrip()))
            replacement = f"{indent}{{/* [APP-FILTER] settings {target_screen} masqué */}}\n"
            return lines[:start] + [replacement] + lines[end + 1 :], True
    return lines, False

def hide_bottom_nav(content: str) -> str:
    old = "{!isMenuGroupeMode && !isOrderPrepMode && currentScreen !== 'ficheTechnique' && currentScreen !== 'menuRestaurant' && currentScreen !== 'menuRestaurantDraft' && currentScreen !== 'events' && currentScreen !== 'facturation' && currentScreen !== 'rapportArdoise' && currentScreen !== 'prestataires' && ("
    new = "{false && !isMenuGroupeMode && !isOrderPrepMode && currentScreen !== 'ficheTechnique' && currentScreen !== 'menuRestaurant' && currentScreen !== 'menuRestaurantDraft' && currentScreen !== 'events' && currentScreen !== 'facturation' && currentScreen !== 'rapportArdoise' && currentScreen !== 'prestataires' && ("
    return content.replace(old, new, 1)

def customize(app_name: str, cfg: dict):
    print(f"\n=== {app_name} ===")
    idx = APPS_ROOT / app_name / "app" / "index.tsx"
    lines = idx.read_text(encoding="utf-8").splitlines(keepends=True)
    initial = len(lines)

    for tid in cfg["hidden_sidebar"]:
        lines, ok = hide_sidebar_block(lines, tid)
        print(f"  [{'ok' if ok else 'warn'}] {tid}")

    if cfg.get("hide_settings_history"):
        lines, ok = hide_settings_item(lines, "history")
        print(f"  [{'ok' if ok else 'warn'}] settings history")
    if cfg.get("hide_settings_prestataires"):
        lines, ok = hide_settings_item(lines, "prestataires")
        print(f"  [{'ok' if ok else 'warn'}] settings prestataires")

    content = "".join(lines)
    if cfg.get("hide_bottom_nav"):
        new_content = hide_bottom_nav(content)
        if new_content != content:
            print("  [ok] bottom nav masquée")
            content = new_content
        else:
            print("  [warn] bottom nav non trouvée")

    idx.write_text(content, encoding="utf-8")
    final = content.count("\n")
    print(f"  [stat] {initial} → {final} lignes ({initial - final} supprimées)")

def main():
    for app, cfg in APPS_CONFIG.items():
        customize(app, cfg)

if __name__ == "__main__":
    main()
