import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anticipationScore, franchiseStrength, hypeLevel, networkStrength, rankByAnticipation,
  relativeBuzzByReleaseWindow, releaseWindow, saturate, scaleSignal, seriesScale, trendingStrength, HYPE_THRESHOLD
} from '../../api/_anticipation.js';

test('a blockbuster announced for next season outranks an imminent film nobody waits for', () => {
  const blockbuster = { popularity: 54, daysUntilRelease: 85, buzzPercentile: 1, scale: 1 };
  const imminentNoise = { popularity: 28, daysUntilRelease: 8, buzzPercentile: 1, weekRank: 7, scale: 0 };
  assert.ok(anticipationScore(blockbuster) > anticipationScore(imminentNoise));
  assert.deepEqual(rankByAnticipation([
    { id: 'imminent', ...imminentNoise },
    { id: 'blockbuster', ...blockbuster }
  ]).map(item => item.id), ['blockbuster', 'imminent']);
});

test('the release date is not a signal: it only breaks equal scores', () => {
  const ranked = rankByAnticipation([
    { id: 'later', anticipation: 0.5, release_date: '2027-03-01', popularity: 10 },
    { id: 'sooner', anticipation: 0.5, release_date: '2026-10-01', popularity: 10 },
    { id: 'top', anticipation: 0.9, release_date: '2027-02-01', popularity: 10 }
  ]);
  assert.deepEqual(ranked.map(item => item.id), ['top', 'sooner', 'later']);
});

test('trending presence raises a title above an identical quiet one', () => {
  const base = { popularity: 60, daysUntilRelease: 90, buzzPercentile: 0.6, scale: 0 };
  assert.ok(anticipationScore({ ...base, weekRank: 1 }) > anticipationScore(base));
  assert.equal(trendingStrength(1), 1);
  assert.equal(trendingStrength(20), 0.05);
  for (const invalid of [21, 0, -3, null, undefined, Number.NaN]) assert.equal(trendingStrength(invalid), 0);
});

test('popularity is weighed against titles at the same distance from release', () => {
  const items = [
    { id: 'imminent-top', daysUntilRelease: 3, popularity: 30 },
    { id: 'imminent-low', daysUntilRelease: 5, popularity: 2 },
    { id: 'season-top', daysUntilRelease: 100, popularity: 25 },
    { id: 'season-low', daysUntilRelease: 120, popularity: 1 }
  ];
  const standings = relativeBuzzByReleaseWindow(items);
  assert.deepEqual(standings, [1, 0, 1, 0]);
  const seasonTop = anticipationScore({ popularity: 25, daysUntilRelease: 100, buzzPercentile: standings[2] });
  const imminentTop = anticipationScore({ popularity: 30, daysUntilRelease: 3, buzzPercentile: standings[0] });
  const imminentLow = anticipationScore({ popularity: 2, daysUntilRelease: 5, buzzPercentile: standings[1] });
  assert.ok(imminentLow < 0.15, `an imminent title nobody looks at stays low (${imminentLow})`);
  assert.ok(Math.abs(seasonTop - imminentTop) < 0.05, `both window leaders score alike (${seasonTop} vs ${imminentTop})`);
  assert.ok(seasonTop > imminentLow * 2.5, 'being the most awaited of a later window beats being ignored next week');
  assert.equal(releaseWindow(3), 0);
  assert.equal(releaseWindow(100), 4);
  assert.equal(releaseWindow(150), 5);
  assert.equal(releaseWindow(400), 6);
});

test('the saga weight comes from the audience of the previous instalments', () => {
  const avengers = { parts: [{ vote_count: 32000 }, { vote_count: 18000 }, { vote_count: 25000 }, { vote_count: 0 }] };
  const smallSequel = { parts: [{ vote_count: 40 }, { vote_count: 0 }] };
  assert.ok(franchiseStrength(avengers) > 0.9);
  assert.ok(franchiseStrength(smallSequel) < 0.4);
  assert.equal(franchiseStrength(null), 0);
  assert.equal(franchiseStrength({}), 0);
  assert.equal(franchiseStrength({ parts: [] }), 0);
});

test('series are weighed by their returning audience first, then by their platform', () => {
  assert.equal(networkStrength([{ name: 'Netflix' }]), 1);
  assert.equal(networkStrength([{ name: 'HBO' }]), 1);
  assert.equal(networkStrength([{ name: 'Chaine Locale' }]), 0);
  assert.equal(networkStrength([]), 0);
  // A brand new series on a major platform is a promise, not an audience yet.
  assert.equal(seriesScale({ networks: [{ name: 'Netflix' }], numberOfSeasons: 1, voteCount: 0 }), 0.2);
  // A returning series that already gathered an audience is genuinely awaited.
  const returning = seriesScale({ networks: [{ name: 'Netflix' }], numberOfSeasons: 5, voteCount: 20000 });
  assert.ok(returning > 0.95, `a long-running hit is near maximum (${returning})`);
  assert.ok(seriesScale({ numberOfSeasons: 3, voteCount: 1000 }) > seriesScale({ networks: [{ name: 'Netflix' }], numberOfSeasons: 1 }));
  assert.equal(seriesScale({ networks: [{ name: 'Chaine Locale' }], numberOfSeasons: 1 }), 0);
  assert.equal(scaleSignal({ networks: [{ name: 'Netflix' }] }), 0.2);
  assert.equal(scaleSignal({ numberOfSeasons: 3 }), 0.3);
  assert.ok(scaleSignal({ collection: { parts: [{ vote_count: 30000 }] }, networks: [{ name: 'Netflix' }] }) > 0.8);
});

test('scores stay inside [0, 1] and never become NaN', () => {
  const extremes = [
    { popularity: 1e9, voteCount: 1e9, weekRank: 1, dayRank: 1, daysUntilRelease: 0, buzzPercentile: 1, scale: 1 },
    { popularity: -5, voteCount: Number.NaN, weekRank: Number.NaN, daysUntilRelease: Number.NaN, buzzPercentile: Number.NaN, scale: Number.NaN },
    {},
    { popularity: 0, voteCount: 0, weekRank: 0, dayRank: 0, daysUntilRelease: -10, buzzPercentile: 0, scale: 0 }
  ];
  for (const signals of extremes) {
    const score = anticipationScore(signals);
    assert.ok(Number.isFinite(score), `finite for ${JSON.stringify(signals)}`);
    assert.ok(score >= 0 && score <= 1, `bounded for ${JSON.stringify(signals)}`);
  }
  assert.ok(anticipationScore(extremes[0]) > 0.99);
  assert.equal(saturate(200, 200), 1);
  assert.equal(saturate(0, 200), 0);
  assert.equal(saturate(Number.NaN, 200), 0);
});

test('hype levels follow the documented thresholds', () => {
  assert.equal(hypeLevel(HYPE_THRESHOLD.veryHigh), 2);
  assert.equal(hypeLevel(HYPE_THRESHOLD.high), 1);
  assert.equal(hypeLevel(HYPE_THRESHOLD.high - 0.01), 0);
  assert.equal(hypeLevel(Number.NaN), 0);
});

test('a precomputed score is reused instead of being recomputed', () => {
  const ranked = rankByAnticipation([
    { id: 'raw-high', popularity: 500, daysUntilRelease: 10, buzzPercentile: 1 },
    { id: 'scored-high', popularity: 0, daysUntilRelease: 200, anticipation: 0.8 }
  ]);
  assert.deepEqual(ranked.map(item => item.id), ['scored-high', 'raw-high']);
});
