# Plan d'Implémentation : Moteur de Recherche "LLM-First" (Routage par IA & Supabase)

Refonte du moteur de recherche d'Éliciné pour adopter une architecture "LLM-First" en 2 étapes côté backend (API Route `/api/search`) avec résolution dans le catalogue Supabase et gestion stricte du cas zéro résultat.

---

## Architecture Cible

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Front-end (Éliciné)                             │
│       Requête utilisateur : "un film de SF sombre sur les souvenirs"   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ POST /api/search (action: llm-first)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      ÉTAPE 1 : Cerveau LLM                             │
│     System Prompt strict d'Encyclopédie universelle du cinéma          │
│     Groq (Llama 3.3 70B) / DeepSeek / Qwen / Gemini                   │
│     Sortie JSON : { "matches": [{ "title": "...", "reason": "..." }] } │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ extractedTitles: ["Dark City", "Strange Days", ...]
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               ÉTAPE 2 : Résolution Catalogue Supabase                  │
│     supabase.from('movies').select('*').in('title', extractedTitles)   │
│     + matching original_title                                          │
│     + badge "Recherche Intelligente LLM" & match_reason                │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │                               │
       [Résultats trouvés > 0]             [Zéro correspondance locale]
                    │                               │
                    ▼                               ▼
┌─────────────────────────────────────┐  ┌───────────────────────────────┐
│     Affichage Immédiat Cartes       │  │  ÉTAPE 3 : Filet de Sécurité  │
│  Badge "Recherche Intelligente LLM" │  │  movies: [] (STRICT)          │
│  Notes, Affiches, Streaming         │  │  ZÉRO blockbuster aléatoire   │
│                                     │  │  Écran élégant :              │
│                                     │  │  "Notre IA cherche la perle   │
│                                     │  │   rare..." + Proposer film    │
└─────────────────────────────────────┘  └───────────────────────────────┘
```

---

## User Review Required

> [!IMPORTANT]
> **Règle Zéro Résultat Anti-Aberration :**
> Si le catalogue Supabase local ne contient pas les films identifiés par le LLM, le système renvoie rigoureusement un tableau vide `movies: []`. **Aucun film aléatoire ou blockbuster par défaut (Spider-Man, Vaiana, etc.) ne sera injecté.** Le front-end affichera directement l'écran de secours avec le bouton *"Proposer ce film à l'équipe"*.

> [!NOTE]
> **Tolérance et résilience Supabase :**
> La table `movies` est interrogée en priorité via `.in('title', extractedTitles)` et `.in('original_title', extractedTitles)`. Si la table `movies` n'est pas encore créée dans un environnement de test, la table `movies_embeddings` (qui stocke les métadonnées et titres) est interrogée en repli direct pour garantir la continuité de service.

---

## Proposed Changes

### 1. Backend Search Route

#### [MODIFY] [`api/search.js`](file:///c:/Users/joris/Downloads/CINEAI/api/search.js)
- Étendre le handler `POST` pour supporter l'action `llm-first` (ou recherche par défaut avec `query`).
- **ÉTAPE 1 (Cerveau LLM)** :
  - Intégrer le System Prompt exact demandé par la spécification :
    ```text
    Agis en tant qu'encyclopédie universelle du cinéma. Analyse la requête de l'utilisateur et identifie entre 3 et 6 titres de films exacts (en français ou titre original international) qui correspondent le plus précisément à cette description, ambiance ou contrainte. 
    Tu dois impérativement répondre sous la forme d'un objet JSON strict respectant ce format :
    {
      "matches": [
        { "title": "Titre du film 1", "reason": "courte justification" },
        { "title": "Titre du film 2", "reason": "courte justification" }
      ]
    }
    ```
  - Appeler la cascade haute disponibilité de providers : Groq (Llama 3.3 70B), DeepSeek (deepseek-chat), Qwen (DashScope), Gemini.
  - Parser le JSON strict et extraire `matches` et `extractedTitles`.
- **ÉTAPE 2 (Résolution Supabase)** :
  - Requêter Supabase :
    `await supabaseServer.from('movies').select('*').or(...)`
  - Si des correspondances sont trouvées dans le catalogue :
    - Associer à chaque film sa justification `reason` du LLM.
    - Ajouter le badge `"Recherche Intelligente LLM"`.
    - Renvoyer `{ success: true, movies, count, badge: "Recherche Intelligente LLM" }`.
- **ÉTAPE 3 (Filet de Sécurité Zéro Résultat)** :
  - Si aucune correspondance trouvée :
    - Renvoyer `{ success: true, movies: [], isEmpty: true, badge: "Recherche Intelligente LLM" }`.
    - Aucune injection de blockbusters par défaut.

---

### 2. Frontend Services & Affichage

#### [MODIFY] [`src/services/unifiedAiSearch.ts`](file:///c:/Users/joris/Downloads/CINEAI/src/services/unifiedAiSearch.ts)
- Connecter le pipeline principal de recherche à l'API backend `POST /api/search` avec `action: 'llm-first'`.
- En cas de résultats `movies: []`, respecter strictement le tableau vide (aucun fallback sur des films populaires).
- Transmettre la propriété `ai_badge = "Recherche Intelligente LLM"` et `ai_match_reason` aux films.

#### [MODIFY] [`src/components/movies/MovieCard.tsx`](file:///c:/Users/joris/Downloads/CINEAI/src/components/movies/MovieCard.tsx)
- Afficher le badge `"Recherche Intelligente LLM"` élégamment en haut de la carte du film lorsqu'il est présent.

---

## Verification Plan

### Automated Tests
- Créer un script de test dédié [`scratch/test_llm_first_search.mjs`](file:///c:/Users/joris/Downloads/CINEAI/scratch/test_llm_first_search.mjs) :
  1. Tester l'extraction JSON par le LLM avec le prompt strict (3 à 6 titres avec `title` et `reason`).
  2. Tester la résolution dans Supabase (`movies` / `movies_embeddings`).
  3. Tester le filet de sécurité zéro résultat (garantir que `movies` est strictement un tableau vide `[]` sans blockbusters de secours).
- Exécuter la compilation TypeScript et Vite (`npm run build`) pour vérifier l'intégrité globale du build.

### Manual Verification
- Valider le comportement sur l'interface :
  1. Requête ciblée (ex: *"un film de science-fiction sombre sur un monde où les souvenirs peuvent être piratés"*) -> Titres exacts identifiés par l'IA, badge "Recherche Intelligente LLM" affiché sur les cartes.
  2. Requête introuvable / absente du catalogue -> Affichage immédiat de l'écran élégant *"Notre IA cherche la perle rare, mais cette description est un peu trop mystérieuse..."* et bouton *"Proposer ce film à l'équipe"*.
