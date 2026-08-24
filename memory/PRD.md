# NeoChef — Product Requirements Document

## Original problem statement
NeoChef is a restaurant management PWA (Expo web + FastAPI backend + MongoDB) originally organised as **one monolithic Expo app** whose `index.tsx` file contained every feature. The user is splitting it into **three focused mobile apps** and needs the shared codebase tree-shaken so each app ships only the screens/logic it uses. In parallel, the user deploys the backend to **Render** and consumes it from the three Expo apps + a web PWA preview.

### The three apps
| App | Features it must keep |
|---|---|
| `neochef-taches` | Tâches + Préparation de commande |
| `neochef-menu` | Menu + Menu en cours + Menu Client + Fiche Technique + Ardoise |
| `neochef-events` | Menu Groupe + Événement + Facturation + Prestataire |

### Language
User communicates in **French**. Agent must always respond in French.

---

## Architecture
```
/app/
├── backend/                     # FastAPI + MongoDB (18 683-line monolithic server.py)
│   ├── server.py                # ⚠️ Serves both API (/api/*) and Expo web dist
│   ├── dist.old/                # Pre-built Expo web export (dated 10 May 2026)
│   └── uploads/                 # (created at runtime, now RELATIVE to ROOT_DIR)
├── frontend/                    # Web PWA — package.json has ONLY `serve -s build`
│   ├── src/                     # ⚠️ NOT built by anything — orphan source
│   └── build/  → symlink → /app/backend/dist.old   # <- preview fix (2026-05-11)
├── apps/
│   ├── neochef-taches/  app/index.tsx   (~9 600 lines after cleanup)
│   ├── neochef-menu/    app/index.tsx   (~14 200 lines after cleanup)
│   └── neochef-events/  app/index.tsx   (~11 800 lines after cleanup)
└── neochef-github-export/       # Mirror pushed to GitHub → deployed on Render
    └── backend/server.py        # Kept in sync with /app/backend/server.py
```

Deploy target: **Render.com** (service name `NeoChef-Tache`, live at https://neochef-tache.onrender.com).
GitHub repo (private): https://github.com/kajarupan10-boop/Neochef-tache

---

## Change log

### 2026-08-24 — Cold-start acceleration (deployment blocker follow-up)
- **Testing_agent iteration_18 result**: 57/60 tests pass; lazy proxies verified; event-loop starvation stays fixed.
- **Cold-start optimization** :
  - Removed top-level `from PIL import Image`, `from fpdf import FPDF`, `from sendgrid import ...` — replaced with **lazy proxy classes** (`_LazyModule`, `_LazyClass`) that import on first attribute access.
  - Local `from fpdf import FPDF` added inside each of 3 functions containing `class *(FPDF)` (proxy doesn't support inheritance).
  - Defensive `from PIL import Image as PILImage` added to pre-existing (broken) reference in `get_invoice_pdf`.
  - Confirmed `python -X importtime`: no PIL/fpdf/sendgrid load at module import → cold-start now **~1.15s locally** (down from 1.4s).
  - Also offloaded the `from emergentintegrations.llm.chat import ...` to a thread via `asyncio.to_thread` (avoids litellm ~1s sync init on the event-loop).
- **Testing_agent note**: "the 58s production cold-start likely comes from outside server.py (image pull, pip/site-packages warm-up, MongoDB Atlas TLS handshake, sidecar init)" — Python-side is now as fast as it can go without splitting the file.

### 2026-08-24 — Event-loop starvation fix (deployment blocker)
- **Root cause found by testing_agent (iteration_16)** : `LlmChat.send_message` uses litellm which does blocking HTTP internally → `await chat.send_message()` was FREEZING the FastAPI event loop during translation → `/health` timed out for 5s+ on every K8s liveness probe → pod restart loop.
- **Primary fix (verified iteration_17)** :
  - Wrapped every `await chat.send_message(...)` in `asyncio.to_thread(_blocking_call)` where `_blocking_call` runs `asyncio.run(chat.send_message(msg))` in a worker thread. Applied to 4 locations: `regenerate_translations_background`, `/api/public/translations/{id}/generate-legacy`, `/api/translate`, `/api/translate-and-store`.
  - `POST /api/public/translations/{id}/generate` now returns **HTTP 202 immediately** (fire-and-forget via `trigger_translation_regeneration`) instead of blocking 60-90s.
  - `asyncio.get_event_loop()` → `asyncio.get_running_loop()` with fallback (Python 3.12+ safe).
  - `FastAPI(docs_url=None, redoc_url=None, openapi_url=None)` — disabled docs/openapi for production.
- **Verified** : `/health` stayed at **1-2 ms** for 26+ consecutive probes over 15 min while a real 7-language LLM translation ran in background (previously hung 10-14 min).
- **Additional cleanup** :
  - Removed the 300s global timeout that prevented large menus (232 items × 7 langs) from ever persisting.
  - Parallelized the 7 languages via `asyncio.gather` with `Semaphore(2)`.
  - **Incremental persistence** per language: each language upserts as it finishes (`$set: {translations.{lang}: ...}`) so partial progress isn't lost.
- **Regression tests** : 29/34 in `/app/backend/tests/test_coldstart_regression.py`.

### 2026-08-24 — Traduction Cache (γ) + Drawer dark navy (α)
- **γ Traduction Cache — TERMINÉ** :
  - `trigger_translation_regeneration()` **réactivé** (server.py L213) : non-bloquant via `asyncio.create_task`, dédupliqué par restaurant_id (skip si task en cours), timeout global 5 min.
  - **Content-hash SHA256** ajouté aux deux chemins (endpoint manuel + background) : si les textes du menu sont identiques, aucun appel LLM → réponse `{cached:true}` en ~400ms.
  - **Modèle upgradé** : `gpt-4.1-mini` → `gpt-5.6-luna` (via emergentintegrations, EMERGENT_LLM_KEY).
  - 7 langues cibles cachées : EN, ES, DE, IT, ZH, RU, PT.
  - Validation e2e : fresh generate (~60s LLM), cache-hit (~400ms), GET translations (~245ms), auto-trigger sur POST `/menu-restaurant/items/create` visible dans les logs `[TRANSLATE] Scheduled background translation`.
- **α Menu déroulant dark navy — TERMINÉ** :
  - Dans les 3 apps (`neochef-taches/menu/events`) : le drawer hamburger (`managerMenuLeft`) est maintenant hardcodé en `#0f172a` (dark navy) + border `rgba(125,211,252,0.18)`, texte `#e8f1ff`. Ignore désormais les couleurs restaurant pour le chrome — cohérent avec la landing page.
  - Rebuild Expo × 3 apps validé.
- **β Thème unifié** : reporté (nécessite décision produit sur les palettes restaurant existantes).


- **Bug corrigé**: `POST /api/auth/forgot-password` retournait **500** (`NameError: SENDGRID_FROM_EMAIL is not defined`). Fix: chargement `SENDGRID_FROM_EMAIL = os.environ.get('SENDGRID_FROM_EMAIL')` à côté de `SENDGRID_API_KEY` dans `/app/backend/server.py`. Le flow backend complet (forgot → verify → reset → login) fonctionne. **⚠️ SendGrid retourne 401 Unauthorized** (clé API révoquée/invalide) — user choix **B** = skip pour l'instant.
- **Feature "Mon compte"** :
  - Backend : ajouts `POST /api/auth/change-email` (nécessite current_password, gère 409 doublon), `POST /api/auth/update-profile` (change name). Endpoint existant `POST /api/auth/change-password` réutilisé.
  - Frontend landing (`/app/scripts/landing-index.html` → copié dans `/app/frontend/build/index.html`) : petit bouton **✎** à côté du nom `Nagaratnam` dans le bandeau bienvenue. Clic → ouvre une vue "Mon compte" (name / email / password), sans toucher à la tuile ⚙ Paramètres (elle continue de pointer vers `/menu/#settings` = tous les vrais paramètres restaurant : QR, équipe, menu, couleurs, etc.).
- **UX itérations** : initialement placé comme tuile "Mon compte" séparée → user a demandé de le retirer (trop de lignes) et remplacer par un simple bouton crayon sur la carte bienvenue. Fait.

### 2026-08-24 — Preview DB reset + events app fixes (this session)
- **Requête utilisateur** : `Reset Preview Data — Wipe the preview MongoDB and re-seed with your real 2 restaurants + holding so the flow matches what you have on Render`.
- **Restauration DB** : `mongorestore --db test_database /app/mongo_backup/test_database/` a restauré 21 users, 21 restaurants, 34 catégories, 36 daily tasks, 44 task templates, 3 ardoises. Vraies données : Holding "Groupe Naga" (`groupenaga@gmail.com`) lié à 2 restaurants (**Le Cercle** `rest_efb3705687ef` + **O'Parloir** `rest_17e485265f52`), staff **Tharshan** (`tharshikan@orange.fr`) sur Le Cercle.
- **Reset passwords** : ré-hashé les 2 comptes documentés avec le schéma SHA256+salt du backend (pas bcrypt — c'était l'erreur initiale). Voir `hash_password()` dans `/app/backend/server.py` L1141.
- **Bugs découverts + corrigés dans `/app/apps/neochef-events/app/index.tsx`** :
  1. **`<EventsScreen>` jamais rendu** (branche `currentScreen === 'events'` supprimée pendant le tree-shaking) → écran 100% blanc pour le Holding. Fix : ajout de la branche render après facturation (~L1795) avec tous les props nécessaires.
  2. **Token race** sur `loadEvents()` et `loadPrestataires()` au login (state pas encore setté → 401). Fix : les 2 fonctions acceptent maintenant `token?: string`, et `LoginScreen.onLogin` + `fetchUserData` passent le token explicitement.
  3. **Écran blanc pour staff sans accès events** (défaut `currentScreen='events'` + `hasEventsAccess()=false` → aucune branche match). Fix : ajout d'un fallback "Accès restreint" (icône cadenas + texte + bouton "Se déconnecter") quand aucune branche ne match.
- **Validé** par testing_agent (iteration_10, 11, 12, 13) : Holding voit ses 2 restaurants + événement, staff voit fallback "Accès restreint", régression /taches/ + /menu/ + landing OK.

### 2026-08-24 — Preview resilience fix
- **Bug**: `Je n'arrive pas ouvrir` — https://chef-tasks.preview.emergentagent.com returned HTTP 404 on all frontend routes.
- **Root cause**: `/app/frontend/build/` is an ephemeral artifact directory (not in git). A container restart wiped it. `serve` was up but had nothing to serve.
- **Fix**: added `/app/scripts/ensure-build-and-serve.sh` — a wrapper that (1) fast-assembles `build/` from the persisted `/app/apps/neochef-*/dist/` folders if missing, (2) falls back to full `bash /app/scripts/build-all-apps.sh` if any `dist/` is also missing, (3) execs `yarn --cwd /app/frontend start`. Updated `/etc/supervisor/conf.d/supervisord.conf` so `[program:frontend].command = bash /app/scripts/ensure-build-and-serve.sh`.
- **Validated** by testing_agent (iteration_9.json): `rm -rf build/ && supervisorctl restart frontend` self-heals in ~5s, all 4 routes return 200.

### 2026-08-24 — Register buttons + admin seed
- **Bugs**: (1) `pas de bouton pour créer un compte` — the tree-shaked select screen showed only a single 'Connexion' button; (2) `Je n'arrive pas connecter avec mes identifiants` — admin credentials in `test_credentials.md` returned 401 because the preview MongoDB was empty.
- **Fix**: (A) added 2 new TouchableOpacity buttons to `mode === 'select'` in all 3 apps' `app/index.tsx` — 'Créer un restaurant' (data-testid=register-restaurant-button) → `setMode('register')`, and 'Créer un groupe (Holding)' (data-testid=register-holding-button) → `setMode('register-holding')`. The register/register-holding forms + backend endpoints already existed. (B) POST /api/auth/register-admin to seed `groupenaga@gmail.com / LeCercle123!` (admin, restaurant 'Groupe Naga'). Rebuilt & re-assembled.
- **Validated** by testing_agent (iteration_8.json): 3 buttons present on all 3 apps, register forms open correctly, login returns 200 + session_token.

### 2026-08-24 — Multi-app landing
- **Change**: from single-app preview (symlink to `dist.old`) to a proper 3-app landing.
- **Steps**: added `build:web: expo export -p web` + `experiments.baseUrl` to each of the 3 Expo apps → parallel builds → assembled into `/app/frontend/build/{taches,menu,events}` + hand-written landing `index.html` + `serve.json` rewrites → post-process each `index.html` (strip SW registration, fix manifest/apple-touch baseUrl).
- **Validated** by testing_agent (iteration_7.json) — 3 distinct bundles, deep SPA routes work, no cross-app SW contamination.

### 2026-05-11 — Preview fix (initial)
- **Bug**: `Preview ne fonctionne pas` — HTTP 404 on `/`.
- **Root cause**: `/app/frontend/package.json` runs `serve -s build -l 3000` but `/app/frontend/build/` did not exist.
- **Fix (superseded by 2026-08-24 changes)**: symlinked `/app/frontend/build` → `/app/backend/dist.old`. Later replaced by proper build pipeline.

### 2026-05-11 — Render deployment fix
- **Bug**: Render deploy for `NeoChef-Tache` exited with status 1, no Python traceback in logs.
- **Root cause**: `server.py` crashed silently at import time trying to `os.makedirs('/app/backend/uploads/…')` (PermissionError on Render).
- **Fix**: relative paths + `try/except` + `print(..., flush=True)`. Applied to both `/app/backend/server.py` and `/app/neochef-github-export/backend/server.py`. Live at https://neochef-tache.onrender.com.

### Earlier this job — Codebase tree-shaking
- Removed ~3 700 lines of unused features from each of the three Expo apps' `index.tsx`.

---

## Open backlog (priority order)

### P0 — Preview reproducibility
- **Add a real build step** to `/app/frontend/package.json` (e.g. `expo export -p web` or Vite build). Today the preview only works because `build` is a symlink to a static export from 10 May. Any change under `/app/frontend/src` is invisible.

### P1 — UX defects (from testing_agent iteration_6)
- Missing **Ionicons TTF** in the served build → icons render as tofu app-wide. Copy `@expo/vector-icons` fonts into `dist.old/assets/…` or regenerate the export.
- Login error banner shows `[object Object]` on FastAPI 422 responses (client only handles string `detail`).
- Dashboard has beige content area on a navy-themed app + light-grey empty-state text on beige → very low contrast.
- Remove dead `unpkg.com/ionicons@7.1.0/…` `<link>`/`<script>` from `index.html` (blocked by ORB).
- De-duplicate the dashboard load: `/api/permanent-subtasks/list` fires 10+ times per render.

### P1 — Data seeding
- Local `test_database` MongoDB is empty. Credentials in `/app/memory/test_credentials.md` return 401 because those users don't exist locally. Add an idempotent seed script or document the actual working accounts.

### P2 — Verify frontend tree-shaking (blocked)
- Install `node_modules` in each `/app/apps/neochef-*` and run the app on a device/simulator to confirm the aggressive deletion didn't break any surviving screen. Currently only `tsc` was run.
- Verify `screensWithoutBottomNav` array and `Drawer.Screen` list in each cleaned `index.tsx`.

### P2 — Render / production hardening
- `FRONTEND_URL` is not set on Render → password-reset emails will contain broken links.
- Free-tier instance sleeps after 15 min → 50-second cold-start; upgrade plan or add a pinger.
- Add a `/api/health/db` endpoint that actually `ping`s Mongo, and configure Render to use it as the health check.

### P3 — Refactoring (long-term)
- `/app/backend/server.py` is 18 683 lines — split into `routes/`, `services/`, `models/` (folders already exist but nearly empty).
- Each `apps/neochef-*/app/index.tsx` is still 10 k+ lines — extract shared components.

---

## Test credentials
See `/app/memory/test_credentials.md`. **Note**: those accounts currently return 401 against the local preview because the DB is empty; only fresh registration via `/api/auth/register-admin` works in the local preview env.
