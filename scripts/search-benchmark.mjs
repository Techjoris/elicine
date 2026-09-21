#!/usr/bin/env node
/**
 * Generalization benchmark for the search engine (Mission 1/3).
 *
 * Replays the semantic precision corpus through the shared fixture harness and
 * reports the quality metrics the mission tracks - Top1, Top3, MRR, constraint
 * violations, off-topic rate, average semantic coverage and average result
 * count - overall, per media type and per set, so a film-side improvement can
 * never hide a series-side regression and a correction aimed at the reported
 * examples can never pass while the rest of the catalogue regresses.
 *
 * The run is deterministic and offline: no provider, no network, no key.
 *
 * Usage:
 *   node --import tsx scripts/search-benchmark.mjs           # readable report
 *   node --import tsx scripts/search-benchmark.mjs --json    # machine-readable
 */
import { replaySemanticPrecisionCase, semanticPrecisionCorpus, semanticPrecisionSet }
  from '../tests/search/semanticPrecisionHarness.mjs';
import { candidateIdentity, evaluateSearchQuality } from '../src/search/searchEvaluation.js';

const columns = [
  ['top1', 'Top1'], ['top3', 'Top3'], ['mrr', 'MRR'], ['constraintViolationRate', 'violations'],
  ['offTopicRate', 'offTopic'], ['averageSemanticCoverage', 'coverage'], ['averageResultCount', 'results']
];

const runs = [];
for (const entry of semanticPrecisionCorpus) runs.push(await replaySemanticPrecisionCase(entry));

const entriesFor = name => name === 'all' ? semanticPrecisionCorpus
  : semanticPrecisionSet(name);
const runsFor = name => {
  const wanted = new Set(entriesFor(name).map(entry => entry.id));
  return runs.filter(run => wanted.has(run.id));
};

const quality = {};
for (const name of ['development', 'generalization', 'all'])
  quality[name] = evaluateSearchQuality(runsFor(name));

const perCase = runs.map(run => ({
  id: run.id, set: run.set, query: run.query, resultCount: run.results.length,
  top: run.results[0] ? { identity: candidateIdentity(run.results[0]),
    title: run.results[0].title, matchScore: run.results[0].ranking?.matchScore ?? null } : null,
  identities: run.results.map(candidateIdentity)
}));

const fixed = value => Number(value).toFixed(3);
const row = (label, metrics) => `${label.padEnd(16)}${columns
  .map(([field]) => fixed(metrics[field]).padStart(11)).join('')}`;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ quality, perCase }, null, 2));
} else {
  console.log(`Semantic precision benchmark - ${runs.length} cases\n`);
  console.log(row('set / media', Object.fromEntries(columns.map(([field]) => [field, 0])))
    .replace(/0\.000/g, '  -  ').replace(/ +$/, ''));
  for (const name of ['development', 'generalization', 'all']) {
    const { overall, byMediaType } = quality[name];
    console.log(`\n[${name}] ${overall.caseCount} cases`);
    console.log(row('  movie', byMediaType.movie || {}));
    console.log(row('  tv', byMediaType.tv || {}));
    console.log(row('  overall', overall));
  }
  console.log('\nPer case:');
  for (const entry of perCase) console.log(`  ${entry.id.padEnd(32)} ${String(entry.resultCount).padStart(2)} result(s)` +
    `${entry.top ? `  top: ${entry.top.title} (${entry.top.matchScore})` : '  <empty>'}`);
}