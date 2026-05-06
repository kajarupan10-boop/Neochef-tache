# NeoChef — 3 applications iOS indépendantes

Cette structure remplace l'ancien monolithe `/app/temp_clone/frontend/` (27 238 lignes) par **3 applications Expo séparées**, chacune avec son propre bundle iOS, son propre login et son propre périmètre fonctionnel.

```
/app/apps/
  ├── neochef-taches/   ← App 1 : Tâches + Préparation de commande
  ├── neochef-menu/     ← App 2 : Menus + Fiche Technique + Rapport Ardoise
  └── neochef-events/   ← App 3 : Menu Groupe + Événements + Facturation + Prestataires
```

Le backend FastAPI (`/app/backend/server.py`) et la base MongoDB sont **partagés**. Les 3 apps utilisent les **mêmes endpoints** et la **même DB utilisateurs**, mais chaque app a son propre écran de login et son propre stockage local (AsyncStorage), garantissant une indépendance totale au niveau iOS.

## 📱 Identifiants iOS

| App         | Bundle ID            | Nom affiché      | Slug             | Scheme         |
|-------------|----------------------|------------------|------------------|----------------|
| Tâches      | `com.neochef.taches` | NeoChef Tâches   | `neochef-taches` | `neocheftaches`|
| Menu        | `com.neochef.menu`   | NeoChef Menu     | `neochef-menu`   | `neochefmenu`  |
| Events      | `com.neochef.events` | NeoChef Events   | `neochef-events` | `neochefevents`|

## 📊 Périmètre fonctionnel par app

### App 1 — NeoChef Tâches (`/app/apps/neochef-taches/`)
**Écran par défaut** : Tâches du jour
- Tâches du jour (Daily)
- Préparation de tâches
- Modèles de tâches
- Catégories de tâches
- Tâches permanentes
- **Préparation de commande** (fournisseurs, produits, commandes)
- Historique
- Équipe / Paramètres

### App 2 — NeoChef Menu (`/app/apps/neochef-menu/`) ⭐ priorité user
**Écran par défaut** : Menu Restaurant
- Menu Restaurant (publication)
- Menu Restaurant en cours (brouillon)
- Menu Client (vue publique)
- Fiche Technique (recettes, coûts, allergènes)
- Rapport Ardoise
- Équipe / Paramètres

### App 3 — NeoChef Events (`/app/apps/neochef-events/`)
**Écran par défaut** : Événements
- Événements
- Menu Groupe (sélection multi-plats par section)
- Création de groupe / réservation
- Facturation (devis, factures)
- Prestataires
- Équipe / Paramètres

## 🚀 Démarrage de chaque app (développement)

```bash
cd /app/apps/neochef-menu   # ou neochef-taches / neochef-events
yarn install                 # déjà fait
yarn web                     # lance Metro web
# ou
yarn ios                     # lance simulateur iOS (Mac requis)
```

## 🏗️ Build iOS via EAS

Chaque app a son propre `eas.json` hérité du monolithe. Avant le build, vérifiez :

```bash
cd /app/apps/neochef-menu
npx eas build --platform ios --profile production
npx eas submit --platform ios --latest
```

Le `eas.json` actuel pointe vers Apple Team `77Z6363334` et Apple ID `kajarupan10@icloud.com`. **Pensez à créer 3 `ascAppId` distincts dans App Store Connect** pour chaque bundle ID :
- `com.neochef.taches` → ascAppId à créer
- `com.neochef.menu` → ascAppId à créer
- `com.neochef.events` → ascAppId à créer

Modifiez ensuite chaque `eas.json` :
```json
"submit": {
  "production": {
    "ios": {
      "appleId": "kajarupan10@icloud.com",
      "ascAppId": "<NOUVEAU_ID_PAR_APP>",
      "appleTeamId": "77Z6363334"
    }
  }
}
```

## 🔐 Authentification

Chaque app a son **écran de login indépendant** (`LoginScreen`).
La DB MongoDB des utilisateurs (`mep_users`) est commune : le même couple email/mot de passe fonctionne dans les 3 apps, mais les sessions sont stockées séparément (chaque iOS bundle a son propre AsyncStorage isolé).

**Comptes test** :
- Admin : `groupenaga@gmail.com` / `LeCercle123!`
- Staff : `tharshikan@orange.fr` / `Kajan1012`

## 🔧 Architecture technique

Pour réduire la taille des bundles iOS, chaque app :
1. Conserve **toute la logique partagée** (helpers, state, API client)
2. **Stub les écrans non pertinents** via `function X(_props) { return null }` (les écrans non utilisés deviennent des fonctions vides)
3. **Filtre la barre latérale** (manager menu) pour n'afficher que les items pertinents
4. **Configure l'écran par défaut** sur l'écran principal de l'app

### Tailles de bundle JS (web export, indicateur pour iOS)
- Monolithe original : **4.7 MB** (27 238 lignes)
- App 1 Tâches : **3.9 MB** (10 910 lignes, -60% code)
- App 2 Menu : **4.5 MB** (15 463 lignes, -43% code)
- App 3 Events : **4.0 MB** (13 101 lignes, -52% code)

## 📁 Scripts de génération

Les apps ont été générées par les scripts dans `/app/scripts/` :
- `build_three_apps.py` — copie le monolithe et stub les écrans non pertinents
- `customize_navigation_v2.py` — masque les items de menu non pertinents par app

Pour régénérer les 3 apps depuis le monolithe :
```bash
cd /app
python3 scripts/build_three_apps.py all
python3 scripts/customize_navigation_v2.py
cd /app/apps/neochef-{taches,menu,events}
yarn install
```

## 🗃️ Monolithe d'origine

Le monolithe d'origine est conservé en **lecture seule** à `/app/temp_clone/frontend/` à des fins de référence. Il sera supprimé une fois les 3 apps validées en production.
