/**
 * Le blocage du défilement après une recherche venait de deux choses :
 * une animation de défilement native qui accapare le fil graphique sur mobile,
 * et une grille de résultats très coûteuse à peindre (une centaine de calques
 * floutés + toutes les cartes rendues, même hors écran).
 *
 * Ces tests verrouillent la logique de défilement et les règles de performance
 * qui ont corrigé le problème.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NARROW_VIEWPORT_MAX,
  SMOOTH_SCROLL_MAX_DISTANCE_PX,
  prefersReducedMotion,
  scrollToSectionWhenReady,
  shouldScrollSmoothly
} from '../../src/lib/scroll.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('an animation is refused when the jump is long', () => {
  assert.equal(shouldScrollSmoothly({
    distance: SMOOTH_SCROLL_MAX_DISTANCE_PX + 1, viewportWidth: 1440
  }), false, 'un déplacement de plusieurs écrans doit être instantané');
});

test('an animation is allowed only for a short move on a wide screen', () => {
  assert.equal(shouldScrollSmoothly({ distance: 120, viewportWidth: 1440 }), true);
});

test('a phone never animates its scrolling', () => {
  assert.equal(shouldScrollSmoothly({
    distance: 40, viewportWidth: NARROW_VIEWPORT_MAX
  }), false, 'même court, un défilement animé gèle le geste sur téléphone');
  assert.equal(shouldScrollSmoothly({ distance: 40, viewportWidth: 390 }), false);
});

test('reduced motion and explicit choices always win', () => {
  assert.equal(shouldScrollSmoothly({ distance: 10, viewportWidth: 1440, reducedMotion: true }), false);
  assert.equal(shouldScrollSmoothly({ distance: 10, viewportWidth: 390, force: 'smooth' }), true);
  assert.equal(shouldScrollSmoothly({ distance: 10, viewportWidth: 1440, force: 'auto' }), false);
});

test('the helper survives a server-side render, with no window', () => {
  assert.equal(prefersReducedMotion(), false);
  assert.equal(typeof globalThis.window, 'undefined');
});

test('a result card carries no backdrop blur, the main cost of the grid', () => {
  const card = read('../../src/components/movies/MovieCard.tsx');
  assert.equal(
    /backdrop-blur/.test(card), false,
    'chaque carte empilait cinq flous : la grille devenait impossible à peindre sur mobile'
  );
  assert.match(card, /perf-card/, 'la carte doit garder la classe de rendu différé');
});

test('a card that is off screen is not painted', () => {
  const css = read('../../src/index.css');
  const rule = css.match(/\.perf-card\s*\{[^}]*\}/);
  assert.ok(rule, 'la règle .perf-card doit exister');
  assert.match(rule[0], /content-visibility:\s*auto/);
});

test('the main area is not a nested scroll container', () => {
  const app = read('../../src/App.tsx');
  const mainTag = app.match(/<main className="([^"]+)"/);
  assert.ok(mainTag, 'la balise main doit exister');
  assert.equal(
    /\boverflow-y-auto\b/.test(mainTag[1]), false,
    'un conteneur imbriqué dans une page 100vh piège le défilement tactile'
  );
});

test('the search flow scrolls through the hardened helper', () => {
  const hero = read('../../src/components/hero/HeroSection.tsx');
  assert.match(hero, /scrollToElement\(/, 'le retour vers les résultats doit passer par le helper');
  assert.equal(
    /scrollIntoView\(\s*\{\s*behavior:\s*'smooth'/.test(hero), false,
    'plus aucune animation de défilement non bornée dans le parcours de recherche'
  );
});

/*
 * Le même identifiant était posé sur la grille de résultats et sur celle des
 * tendances. La page visait « le premier élément trouvé » : au moment du clic,
 * les résultats n'étaient pas encore affichés, donc la page atterrissait sur
 * les tendances et l'utilisateur devait remonter pour lire ses résultats.
 */
test('each grid carries its own identifier, so the page can aim at the right one', () => {
  const grid = read('../../src/components/movies/MovieGrid.tsx');
  assert.match(grid, /id\?: string/, 'identifiant optionnel attendu');
  assert.equal(
    /id="results-section"/.test(grid), false,
    'plus aucun identifiant en dur dans la grille'
  );
  assert.match(grid, /<section id=\{id\}/, "l'identifiant reçu doit être posé sur la section");

  const app = read('../../src/App.tsx');
  assert.match(app, /<MovieGrid\s+id="ai-results-section"/, 'la grille de résultats a son identifiant');
  assert.match(app, /<MovieGrid\s+id="trending-section"/, 'la grille des tendances a le sien');
});

test('the page waits for the results to exist before moving to them', () => {
  const hero = read('../../src/components/hero/HeroSection.tsx');
  assert.match(hero, /scrollToSectionWhenReady\('ai-results-section'\)/);
  assert.equal(
    /getElementById\('results-section'\)/.test(hero), false,
    "l'ancien identifiant partagé ne doit plus être visé"
  );
});

test('the waiting helper never throws outside a browser', () => {
  assert.equal(typeof window, 'undefined');
  assert.doesNotThrow(() => scrollToSectionWhenReady('ai-results-section'));
});

/*
 * Le bandeau d'accueil tournait toutes les 8,5 s avec des images en pleine
 * résolution : un décodage plein cadre relançait des à-coups pendant que
 * l'utilisateur lisait ses résultats.
 */
test('the hero background no longer ships full-resolution images', () => {
  const hero = read('../../src/components/hero/HeroSection.tsx');
  assert.equal(
    /image\.tmdb\.org\/t\/p\/original/.test(hero), false,
    'aucune image 3840 px dans le bandeau'
  );
  assert.match(hero, /t\/p\/w1280/, 'le fond du bandeau passe par w1280');
});

test('the hero stops rotating as soon as it leaves the screen', () => {
  const hero = read('../../src/components/hero/HeroSection.tsx');
  assert.match(hero, /IntersectionObserver/, 'la visibilité du bandeau doit être observée');
  assert.match(hero, /isHeroVisible/, 'la rotation dépend de la visibilité');
});

/*
 * Les catalogues (tendances, prochainement, plateformes) affichaient la version
 * « original » des affiches, soit environ 2000 x 3000 px pour une vignette de
 * 176 px : le téléphone décodait des centaines de mégaoctets en défilant.
 */
test('catalog posters are requested at thumbnail size', () => {
  const tmdb = read('../../src/services/tmdb.ts');
  assert.equal(
    /image\.tmdb\.org\/t\/p\/original/.test(tmdb), false,
    'plus aucune affiche en pleine résolution dans les catalogues'
  );
  assert.match(tmdb, /TMDB_POSTER_BASE = 'https:\/\/image\.tmdb\.org\/t\/p\/w500'/);
  assert.match(tmdb, /TMDB_BACKDROP_BASE = 'https:\/\/image\.tmdb\.org\/t\/p\/w1280'/);
});
