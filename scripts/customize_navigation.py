#!/usr/bin/env python3
"""
Personnalise la navigation (sidebar manager menu, settings dropdown, bottom nav)
pour chaque app NeoChef en fonction de son rôle.

App 1 Tâches  : Tâches/Préparation/Templates/Categories/History/PermanentTasks
App 2 Menu    : Menu Restaurant/Draft/Client/Fiche Technique/Rapport Ardoise
App 3 Events  : Menu Groupe/Événement/Facturation/Prestataires
"""
import re
from pathlib import Path

APPS_ROOT = Path("/app/apps")

# Configuration : pour chaque app, quels items du sidebar manager menu
# doivent être MASQUÉS (remplacés par un commentaire)
APPS_CONFIG = {
    "neochef-taches": {
        "hidden_sidebar_items": [
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
        "hide_settings_history": False,  # Tâches utilise l'historique
        "hide_bottom_nav": False,  # Tâches conserve la barre
    },
    "neochef-events": {
        "hidden_sidebar_items": [
            "menu-item-tasks",
            "menu-item-order-prep",
            "menu-item-menu-restaurant",
            "menu-item-menu-restaurant-draft",
            "menu-item-menu-client",
            "menu-item-fiche-technique",
            "menu-item-rapport-ardoise",
        ],
        "hide_settings_prestataires": False,  # Events conserve les prestataires
        "hide_settings_history": True,
        "hide_bottom_nav": True,  # Events n'utilise pas le bottom nav (c'est pour tâches)
    },
}

def hide_sidebar_item(content: str, testid: str) -> str:
    """Trouve `<TouchableOpacity ... data-testid="testid" ...>...</TouchableOpacity>`
    et son éventuel wrapper conditionnel `{cond && (...)}` puis le remplace
    par un commentaire."""
    # Cherche le bloc {(...) && ( <TouchableOpacity data-testid="testid" ...> ... </TouchableOpacity> )}
    # Strategy: locate the testid line, then walk back to find `{(` opening,
    # and forward to find `</TouchableOpacity> )}` closing.
    pattern = re.compile(
        r"(\{[^{}]*?&&\s*\(\s*\n\s*<TouchableOpacity[^>]*data-testid=\"" + re.escape(testid) + r"\"[\s\S]*?</TouchableOpacity>\s*\n\s*\)\})",
        re.MULTILINE,
    )
    new_content, n = pattern.subn(f"{{/* [APP-FILTER] {testid} masqué */}}", content)
    if n == 0:
        # Fallback: tente sans wrapping conditionnel
        pattern2 = re.compile(
            r"(<TouchableOpacity[^>]*data-testid=\"" + re.escape(testid) + r"\"[\s\S]*?</TouchableOpacity>)",
            re.MULTILINE,
        )
        new_content, n = pattern2.subn(f"{{/* [APP-FILTER] {testid} masqué */}}", content)
    return new_content

def hide_settings_dropdown_items(content: str, hide_history: bool, hide_prestataires: bool) -> str:
    if hide_history:
        # cherche le bloc historique dans le settings dropdown
        pattern = re.compile(
            r"<TouchableOpacity\s+\n?\s*style=\{styles\.settingsDropdownItem\}[^>]*?\n[^<]*?onPress=\{[^}]*setCurrentScreen\('history'\)[^}]*\}[\s\S]*?</TouchableOpacity>",
            re.MULTILINE,
        )
        content, n = pattern.subn("{/* [APP-FILTER] History settings masqué */}", content)
    if hide_prestataires:
        pattern = re.compile(
            r"<TouchableOpacity\s+\n?\s*style=\{styles\.settingsDropdownItem\}[^>]*?\n[^<]*?onPress=\{[^}]*setCurrentScreen\('prestataires'\)[^}]*\}[\s\S]*?</TouchableOpacity>",
            re.MULTILINE,
        )
        content, n = pattern.subn("{/* [APP-FILTER] Prestataires settings masqué */}", content)
    return content

def hide_bottom_nav(content: str) -> str:
    """Préfixe la condition d'affichage de la bottom nav par `false &&`."""
    old = "{!isMenuGroupeMode && !isOrderPrepMode && currentScreen !== 'ficheTechnique' && currentScreen !== 'menuRestaurant' && currentScreen !== 'menuRestaurantDraft' && currentScreen !== 'events' && currentScreen !== 'facturation' && currentScreen !== 'rapportArdoise' && currentScreen !== 'prestataires' && ("
    new = "{false && !isMenuGroupeMode && !isOrderPrepMode && currentScreen !== 'ficheTechnique' && currentScreen !== 'menuRestaurant' && currentScreen !== 'menuRestaurantDraft' && currentScreen !== 'events' && currentScreen !== 'facturation' && currentScreen !== 'rapportArdoise' && currentScreen !== 'prestataires' && ("
    return content.replace(old, new, 1)

def customize_app(app_dir_name: str, cfg: dict):
    print(f"\n=== Personnalisation {app_dir_name} ===")
    idx = APPS_ROOT / app_dir_name / "app" / "index.tsx"
    if not idx.exists():
        print(f"[skip] {idx} introuvable")
        return
    content = idx.read_text(encoding="utf-8")
    original_size = len(content)

    for testid in cfg["hidden_sidebar_items"]:
        before = len(content)
        content = hide_sidebar_item(content, testid)
        after = len(content)
        if before != after:
            print(f"  [ok] {testid}: -{before-after}o")
        else:
            print(f"  [warn] {testid}: aucune correspondance")

    content = hide_settings_dropdown_items(
        content,
        cfg.get("hide_settings_history", False),
        cfg.get("hide_settings_prestataires", False),
    )

    if cfg.get("hide_bottom_nav", False):
        content = hide_bottom_nav(content)
        print("  [ok] bottom nav masquée")

    idx.write_text(content, encoding="utf-8")
    print(f"  [stat] {app_dir_name}: {original_size}o → {len(content)}o ({original_size - len(content)}o supprimés)")

def main():
    for app_name, cfg in APPS_CONFIG.items():
        customize_app(app_name, cfg)

if __name__ == "__main__":
    main()
