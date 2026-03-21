# NeoChef - Product Requirements Document

## Résumé du Produit
NeoChef est une PWA de gestion de restaurant complète comprenant:
- Gestion des menus (carte, ardoise)
- Gestion des événements avec prestataires
- Système de permissions pour le staff
- Traductions automatiques des menus (multi-langues)
- Génération de PDF (menus, propositions événements, factures, commandes)
- Rapport mensuel des commandes fournisseurs (par produit ou par date)

## Architecture Technique
- **Frontend**: Expo for Web (React Native Web) - `/app/temp_clone/frontend`
- **Backend**: FastAPI - `/app/backend/server.py`
- **Database**: MongoDB
- **Build servi depuis**: `/app/frontend/build` (copie de `temp_clone/frontend/dist`)

## Session du 21 Mars 2026 (suite)

### Nouvelles Fonctionnalités

#### 1. Filtre "Mode" pour le Rapport Mensuel ✅
- **Ajout d'un 4ème filtre** "Mode" avec deux options :
  - **Par Produit** : Affiche le total par produit (Coca: X unités, Evian: Y unités)
  - **Par Date** : Affiche les commandes jour par jour (18 février: quoi, 24 février: quoi)
- Le titre du modal change dynamiquement selon le mode sélectionné
- Le PDF est aussi généré selon le mode choisi

#### 2. Correction du Téléchargement PDF (iOS) ✅
- **Problème** : Sur iOS Safari, le PDF s'ouvrait en page blanche
- **Solution** : Remplacement de `window.open()` par un téléchargement direct via `fetch()` + `blob`
- Le PDF se télécharge maintenant correctement sur tous les appareils

### Bugs Corrigés (session précédente)

#### 1. Rapport Mensuel Bloqué ✅
- **Cause**: Les routes backend étaient correctement ordonnées
- **Vérification**: L'API `/api/supplier-orders/monthly-report` fonctionne correctement
- **Résultat**: Le rapport s'affiche avec filtres (fournisseur, dates, type, mode), résumé et bouton PDF

#### 2. Modal PDF Facturation Ajouté ✅
- **Modification**: Ajout d'un modal PDF unifié pour Devis et Factures
- **Caractéristiques**: Boutons "Retour" et "Télécharger", prévisualisation iframe
- **Fichiers**: `/app/temp_clone/frontend/app/index.tsx`

### Session du 19 Mars 2026 (précédente)

#### Bugs Corrigés Précédemment
1. Menu Client Bloqué ✅
2. Détails Prestataire Non Affichés ✅
3. Logo PDF Déformé ✅
4. Prix des Plats dans PDF Événement ✅
5. Traduction des Tailles (Petit/Grand) ✅

## Point Technique Important
Le frontend Expo est dans `/app/temp_clone/frontend` mais le serveur sert `/app/frontend/build`. Après chaque modification frontend:
```bash
cd /app/temp_clone/frontend && npx expo export --platform web
cp -r dist/* /app/frontend/build/
sudo supervisorctl restart frontend
```

## État des PDF - Tous Fonctionnels

| Type de PDF | Modal | Bouton Retour | Bouton Télécharger | Status |
|-------------|-------|---------------|-------------------|--------|
| Commandes Fournisseurs | ✅ | ✅ (Fermer) | ✅ | OK |
| Propositions Événements | ✅ | ✅ | ✅ | OK |
| Devis/Factures | ✅ | ✅ | ✅ | OK |
| Rapport Mensuel | N/A (direct) | N/A | ✅ | OK |

## Problèmes Restants (Backlog)

### P0 - Critique
- **Sauvegarde Permissions UI**: Le formulaire de gestion des permissions staff pourrait ne pas sauvegarder correctement (à vérifier avec l'utilisateur)

### P1 - Priorité Haute
- **Aperçu PDF blanc iOS**: L'aperçu PDF dans la PWA iOS peut ne pas fonctionner
- **Barre Navigation iOS**: Problème de mise en page persistant sur iOS
- **Photos Espaces Privatisation**: Ne s'affichent pas côté client

### P2 - Priorité Moyenne
- **Édition Ardoise**: Ne charge pas les plats du menu pour sélection
- **Performance multi-utilisateurs**: À investiguer

### P3 - Refactoring
- Décomposer `server.py` (~18k lignes) en modules
- Décomposer `index.tsx` (~26k lignes) en composants

## Endpoints Clés

### API Publique (Menu Client)
- `GET /api/menu-restaurant/public/{restaurant_id}` - Menu public
- `GET /api/public/translations/{restaurant_id}` - Traductions

### API Événements
- `GET /api/events` - Liste des événements
- `GET /api/events/{id}/providers` - Prestataires d'un événement
- `GET /api/events/{id}/menu/export-pdf` - Générer PDF menu événement

### API Commandes Fournisseurs
- `GET /api/supplier-orders/monthly-report` - Rapport mensuel (JSON)
- `GET /api/supplier-orders/monthly-report/pdf` - Rapport mensuel (PDF)
- `GET /api/supplier-orders/{order_id}/pdf` - PDF commande individuelle

### API Facturation
- `GET /api/invoices/list` - Liste des devis/factures
- `GET /api/invoices/{invoice_id}/pdf` - PDF devis/facture

## Credentials de Test
- **Admin**: `groupenaga@gmail.com` / `LeCercle123!`
- **Staff**: `tharshikan@orange.fr` / `Kajan1012`

## Intégrations
- **MongoDB**: Base de données
- **Emergent LLM**: Traductions automatiques (via Emergent LLM Key)
- **XLSX**: Import/export Excel
- **ReportLab/FPDF**: Génération de PDF
