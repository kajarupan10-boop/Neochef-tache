#!/usr/bin/env python3
"""
Post-traitement: nettoie les résidus des fonctions `StaffGroupViewScreen`
et `EventsScreen` dont le stub n'a pas coupé le corps complet
(destructuration de props multi-lignes).

Pour chaque écran, trouve la ligne `function X(_props: any) { return null...`
puis supprime toutes les lignes suivantes jusqu'à la ligne `}` en colonne 0
(fin du corps original).
"""
from pathlib import Path

INPUT = Path("/app/apps/neochef-menu/app/index.tsx")
TARGETS = ["StaffGroupViewScreen", "EventsScreen"]

def main():
    lines = INPUT.read_text(encoding="utf-8").splitlines(keepends=True)

    for target in TARGETS:
        stub_prefix = f"function {target}(_props: any) {{ return null as any; }}"
        stub_idx = None
        for i, ln in enumerate(lines):
            if ln.strip().startswith(stub_prefix):
                stub_idx = i
                break
        if stub_idx is None:
            print(f"[warn] stub introuvable pour {target}")
            continue

        # Supprime toutes les lignes après le stub jusqu'à la première ligne
        # qui commence par `}` en colonne 0 (ancien corps) INCLUS.
        end_idx = None
        for j in range(stub_idx + 1, len(lines)):
            if lines[j].startswith("}") and not lines[j].startswith("})"):
                end_idx = j
                break
        if end_idx is None:
            print(f"[warn] fin introuvable pour {target}")
            continue

        # Avant de couper, vérifie que le contenu à supprimer ressemble
        # bien à des paramètres + corps (pas à la fonction suivante).
        # Simplement: supprimer lignes [stub_idx+1 .. end_idx] inclus.
        print(f"[ok] {target}: suppression lignes {stub_idx+2}..{end_idx+1} ({end_idx-stub_idx} lignes)")
        del lines[stub_idx + 1 : end_idx + 1]

    INPUT.write_text("".join(lines), encoding="utf-8")
    total = sum(1 for _ in open(INPUT, encoding="utf-8"))
    print(f"[done] Total lignes: {total}")

if __name__ == "__main__":
    main()
