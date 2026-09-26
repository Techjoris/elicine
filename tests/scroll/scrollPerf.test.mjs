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
