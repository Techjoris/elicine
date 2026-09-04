# CinéIA — Le SaaS de Recommandation Cinéma Propulsé par l'IA 🎬⚡

**CinéIA** est une Progressive Web App (PWA) SaaS moderne dotée d'une interface immersive *Dark Cinema* (`#0b0f19`, glassmorphism, néons bleus/violets/dorés), d'un moteur de recherche par intelligence artificielle en langage naturel avec gestion de quota décrémentiel (3/3 IA), de fiches films 100% gratuites (TMDB, lecteurs de bandes-annonces YouTube natifs, Watch Providers streaming & contournement VPN), d'un système de monétisation Pass Pro (1 900 FCFA / multi-devises) et pourboire libre propulsé par **Notch Pay**, ainsi que d'une installation PWA directe.

---

## 🌟 Fonctionnalités Implémentées

### 1. UI/UX "Dark Cinema" & Layout
- **Fond ultra-sombre** `#0b0f19`, effets de flou cinématique (`backdrop-blur`), et néons d'ambiance (`#3b82f6`, `#8b5cf6`, `#f59e0b`).
- **Sidebar fixe** : Accueil, Tendances, Catalogue complet, Plateformes de streaming (Netflix, Prime, Canal+, Apple TV+), Ma Liste (Favoris), Mes Alertes, Film Surprise aléatoire, Historique IA avec bouton "Vider", Profil utilisateur avec badge de statut (👑 PRO ou 🆓 GRATUIT) et lien d'affiliation.
- **Header fixe** : Logo CinéIA, convertisseur multi-devises interactif, boutons d'accès rapide [`👑 Pro`, `🧋 Soutenir`, `⚙️ Clés API`, `👤 Compte`] et bouton d'installation **`📲 INSTALLER L'APPLICATION`** mis en évidence.

### 2. Dynamique Hero & Carrousel Filigrane
- Carrousel rotatif d'arrières-plans de films tendances TMDB floutés.
- Titre dynamique du film à l'affiche + slogan d'accroche : *"Décrivez l'ambiance, le genre, ou une émotion — CinéIA trouve le film parfait pour vous."*
- **4 boutons d'action** : `[▶ Bande-annonce]`, `[+ Ma Liste]`, `[🔔 Activer Alerte]`, `[▶ Chercher sur YouTube]`.

### 3. Moteur IA & Quota Gratuit (⚡ 3/3 IA)
- Barre de recherche en langage naturel pour exprimer des ambiances (ex: *"Un thriller psychologique sombre sous la pluie avec un twist final"*).
- Analyse sémantique avancée (compatible **Groq**, **OpenAI GPT-4o** et moteur d'inférence démo intégré).
- Compteur décrémentiel dynamique stocké dans le `localStorage`.
- Blocage automatique à la 4ème recherche pour afficher le modal **Pass Pro**.

### 4. Fiches Films 100% Gratuites & Streaming
- Synopsis complet, durée, date de sortie, casting principal, réalisateur.
- Lecteur vidéo YouTube natif intégré dans le modal.
- Section **Où Regarder** (TMDB Watch Providers) avec liens directs vers Netflix, Prime Video, Canal+, Disney+, Apple TV+.
- **Module VPN** : Badge *"🔒 Non disponible dans votre région"* et bouton affilié *"Débloquer avec un VPN"*.

### 5. Monétisation, Notch Pay & Multi-Devises
- **Pass Pro à Vie** : 1 900 FCFA (XAF/XOF), 2,90 €, $3.20 USD, 4,30 CA$ CAD.
- **Pourboire Libre** : Montants suggérés (500 F, 1 000 F, 2 500 F, 5 000 F) ou montant personnalisé.
- **Détection géographique & devises** : Affichage dynamique des options Mobile Money (Orange Money, MTN MoMo, Wave, Moov) pour l'Afrique et Carte Bancaire / Notch Pay pour l'international.
- Redirection directe sans iframe (`window.top.location.href`).

### 6. PWA & Affiliation
- `manifest.json` et Service Worker `sw.js` dans `/public` pour installation native immédiate.
- Capture de l'événement `beforeinstallprompt` au clic sur le bouton d'installation.
- Écouteur de paramètre `?ref=` pour le système de parrainage.

---

## 🚀 Démarrage Rapide

### Lancer le serveur de développement :
```bash
dev.bat
# ou
npm run dev
```

### Compiler pour la production :
```bash
build.bat
# ou
npm run build
```
