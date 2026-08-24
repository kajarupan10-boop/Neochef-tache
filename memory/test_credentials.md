# Comptes de test NeoChef (preview)

La preview Emergent utilise une DB MongoDB restaurée depuis `/app/mongo_backup/` (état capturé le 10 mai 2026) contenant vos données réelles avec les mots de passe re-seedés pour matcher ce fichier.

## Comptes principaux

| Rôle    | Email                       | Mot de passe   | Nom          | Restaurant(s) visibles                |
|---------|-----------------------------|----------------|--------------|---------------------------------------|
| Holding | groupenaga@gmail.com        | LeCercle123!   | Nagaratnam   | **Le Cercle** + **O'Parloir** (Groupe Naga) |
| Staff   | tharshikan@orange.fr        | Kajan1012      | Tharshan     | Le Cercle (rest_efb3705687ef)         |

## Comptes accessoires (non re-seedés — mot de passe inconnu)

| Rôle  | Email                       | Restaurant                  |
|-------|-----------------------------|-----------------------------|
| Admin | kajarupan10@gmail.com       | Le Cercle                   |
| Admin | o.parloir77@gmail.com       | O'Parloir                   |
| Staff | kajan10@orange.fr           | Le Cercle (Nour)            |
| Staff | junuff@gmail.com            | Le Cercle (Junuff)          |

Ces comptes existent dans la DB mais leurs mots de passe d'origine ne sont pas connus. Si besoin, re-seeder via le même script SHA256 utilisé pour les 2 comptes principaux.

## Notes techniques

- **Hashing**: SHA256 avec salt hex (format `{salt_hex}${sha256_hex}`), PAS bcrypt. Voir `hash_password()` dans `/app/backend/server.py` ligne 1141.
- **Base**: `test_database`, collections préfixées `mep_*`.
- **Restauration**: `mongorestore --db test_database /app/mongo_backup/test_database/` puis re-seed des mots de passe via script Python inline.
- **Sessions**: stockées dans `mep_sessions`, valides 30 jours.
- Les 3 apps iOS (`com.neochef.taches`, `com.neochef.menu`, `com.neochef.events`) partagent la même DB mais chaque app a son AsyncStorage isolé (session refetch nécessaire au login sur chaque app).
