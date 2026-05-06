#!/usr/bin/env python3
"""
Découpe le monolithe /app/apps/neochef-menu/app/index.tsx pour ne garder
que les écrans Menu. Les fonctions écran non pertinentes sont remplacées
par des stubs `return null;` pour préserver la cohérence.

Applicable à App 2 "NeoChef Menu".
"""
import re
import sys
from pathlib import Path

INPUT = Path("/app/apps/neochef-menu/app/index.tsx")

# Ecrans à transformer en stubs (conservés : MenuRestaurant, MenuRestaurantDraft,
# FicheTechnique, RapportArdoise, PublicMenuScreen, ClientMenuSelectionScreen,
# LoginScreen, SettingsScreen, UsersScreen, SuperAdminScreen, HistoryScreen,
# CategoriesScreen -- gardées car utilisées par le flux admin).
SCREENS_TO_STUB = [
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
]

def main():
    src = INPUT.read_text(encoding="utf-8")
    lines = src.splitlines(keepends=True)

    # Repère les lignes des sections `// ==================== NAME ====================`
    section_re = re.compile(r"^//\s*=+\s*([A-Z][A-Z0-9 _()]+?)\s*=+\s*$")
    sections = []  # list of (line_idx, name)
    for i, ln in enumerate(lines):
        m = section_re.match(ln.strip())
        if m:
            sections.append((i, m.group(1).strip()))
    print(f"[info] {len(sections)} sections détectées")

    # Repère les débuts de fonction: `function NAME(`
    func_re = re.compile(r"^\s*function\s+(\w+)\s*\(")

    # Pour chaque écran à stubber, trouve la fonction et son bloc
    to_delete_ranges = []  # list of (start, end) inclusive 0-based
    for target in SCREENS_TO_STUB:
        start = None
        # trouve la ligne `function TARGET(`
        for i, ln in enumerate(lines):
            m = func_re.match(ln)
            if m and m.group(1) == target:
                start = i
                break
        if start is None:
            print(f"[warn] fonction introuvable: {target}")
            continue

        # Trouve la fin: première ligne suivante commençant par `}` en colonne 0
        end = None
        for j in range(start + 1, len(lines)):
            if lines[j].startswith("}"):
                end = j
                break
        if end is None:
            print(f"[warn] fermeture introuvable pour: {target}")
            continue
        to_delete_ranges.append((start, end, target))
        print(f"[ok] {target}: lignes {start+1} -> {end+1} ({end-start+1} lignes)")

    # Applique les remplacements en ordre inverse pour préserver les indices
    to_delete_ranges.sort(key=lambda x: x[0], reverse=True)
    for start, end, target in to_delete_ranges:
        stub = f"function {target}(_props: any) {{ return null as any; }}\n"
        lines[start : end + 1] = [stub]

    # Aussi stubs des styles additionnels de fonctions si suivis
    # (ex: menuGroupeStyles etc.) - restent en place car peut-être utilisés ailleurs

    out = "".join(lines)

    # Change l'écran par défaut 'daily' -> 'menuRestaurant'
    out = out.replace(
        "useState<'daily' | 'templates' | 'prepare' | 'categories' | 'users' | 'settings' | 'history' | 'menuGroupe' | 'createGroup' | 'permanentTasks' | 'orderPrep' | 'ficheTechnique' | 'menuRestaurant' | 'events' | 'facturation' | 'rapportArdoise' | 'prestataires' | 'superadmin'>('daily')",
        "useState<'daily' | 'templates' | 'prepare' | 'categories' | 'users' | 'settings' | 'history' | 'menuGroupe' | 'createGroup' | 'permanentTasks' | 'orderPrep' | 'ficheTechnique' | 'menuRestaurant' | 'events' | 'facturation' | 'rapportArdoise' | 'prestataires' | 'superadmin'>('menuRestaurant')",
    )

    # Redirige tous les "setCurrentScreen('daily')" (retours accueil) vers 'menuRestaurant'
    # sauf ceux liés à loadDailyTasks (on laisse)
    out = out.replace("setCurrentScreen('daily')", "setCurrentScreen('menuRestaurant')")

    INPUT.write_text(out, encoding="utf-8")
    print(f"[done] Fichier réécrit: {INPUT}")
    new_lines = out.count("\n")
    print(f"[stat] Nouvelles lignes: {new_lines}")

if __name__ == "__main__":
    main()
