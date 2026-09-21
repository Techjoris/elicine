#!/usr/bin/env node
/** Frozen semantic intents, real provider responses, no injected expected work.
 * Capture: --capture --before scratch/recall-before --output scratch/recall-live.json
 * Replay:  --recording tests/search/narrative-recall-recording.json.gz [--before PATH]
 * A capture needs TMDB_API_KEY or --tmdb-proxy https://your-deployment/api/tmdb.
 * This isolates retrieval; it does NOT measure LLM interpretation accuracy.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import corpus from '../tests/search/narrative-recall-corpus.json' with { type: 'json' };
import { createCanonicalIntent } from '../src/types/canonicalIntent.runtime.js';
import { evaluateCandidateRecall, candidateIdentity } from '../src/search/searchEvaluation.js';
import { createTmdbRetrievalClient } from '../src/search/retrievalServices.js';

const option = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const capture = process.argv.includes('--capture');
const recordingFile = option('--recording') || 'tests/search/narrative-recall-recording.json.gz';
const recording = capture && !option('--recording') ? { capturedAt: new Date().toISOString(), requests: {} }
  : JSON.parse(recordingFile.endsWith('.gz') ? gunzipSync(await fs.readFile(recordingFile)).toString('utf8')
    : await fs.readFile(recordingFile, 'utf8'));
const before = option('--before');
const engines = before ? [['before', before], ['after', '.']] : [['after', '.']];
// Without a historical checkout, compare against the checked-in measured run.
const runs = before ? [] : [...(recording.baseline || [])];
const proxy = option('--tmdb-proxy');
const transport = async raw => {
  const url = new URL(raw);
  url.searchParams.delete('api_key');
  const key = `${url.pathname}?${url.searchParams}`;
  if (!recording.requests[key]) {
    if (!capture) throw new Error(`MISSING_RECORDED_REQUEST ${key}`);
    let target = raw;
    if (proxy) {
      const proxyUrl = new URL(proxy);
      proxyUrl.search = url.search;
      proxyUrl.searchParams.set('endpoint', url.pathname.replace('/3/', ''));
      target = String(proxyUrl);
    }
    const response = await fetch(target, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`CAPTURE_HTTP_${response.status}`);
    recording.requests[key] = await response.json();
  }
  return { ok: true, json: async () => structuredClone(recording.requests[key]) };
};

for (const entry of corpus) {
  if (option('--set') && entry.set !== option('--set')) continue;
  const intent = createCanonicalIntent({ mediaType: entry.mediaType, genres: entry.genres,
    themes: [...entry.concepts, ...entry.motifs], keywords: entry.keywords, languages: entry.languages });
  const semanticIntentContext = { intentType: 'specific_title_description', semanticConcepts: entry.concepts,
    narrativeMotifs: entry.motifs, people: entry.person ? [entry.person.name] : [] };
  for (const [engine, directory] of engines) {
    const module = file => import(pathToFileURL(path.resolve(directory, 'src/search', file)));
    const [{ orchestrateCandidateRetrieval }, { createSearchEvaluationTrace }] = await Promise.all([
      module('searchOrchestrator.js'), module('searchEvaluation.js')]);
    const trace = createSearchEvaluationTrace({ enabled: true });
    const telemetry = {};
    const tmdb = createTmdbRetrievalClient({ apiKey: process.env.TMDB_API_KEY || 'proxy', fetchImpl: transport,
      telemetry, timeoutMs: capture ? 18000 : 3500 });
    const results = await orchestrateCandidateRetrieval({
      orchestration: { canonicalIntent: intent, resolvedIntentContext: { resolvedTitles: [], requestedTitles: [],
        resolvedPeople: entry.person ? [{ ...entry.person, resolutionConfidence: 1 }] : [] } },
      services: tmdb, context: { telemetry, evaluationTrace: trace, semanticIntentContext, sourceTimeoutMs: capture ? 20000 : 4000 }
    });
    const pool = trace.candidatePool?.length ? trace.candidatePool : trace.poolAfterDeduplication;
    const recall = evaluateCandidateRecall(pool, [entry.expected]);
    const run = { id: entry.id, set: entry.set, engine, mediaType: entry.mediaType,
      intentType: semanticIntentContext.intentType, concepts: entry.concepts, motifs: entry.motifs,
      ...recall, finalPosition: results.findIndex(row => candidateIdentity(row) === candidateIdentity(entry.expected)) + 1 || null,
      resultCount: results.length, tmdbCalls: telemetry.tmdbCalls || 0,
      errors: telemetry.retrievalSourceErrors, trace };
    runs.push(run);
    if (run.errors?.length && !capture) throw new Error(`RECORDED_SOURCE_FAILURE ${entry.id}/${engine}`);
    console.log(JSON.stringify({ id: run.id, engine, recall10: recall.candidateRecallAt10,
      recall20: recall.candidateRecallAt20, beforeRanking: recall.expectedPositions[0]?.position,
      final: run.finalPosition, results: run.resultCount, calls: run.tmdbCalls, errors: run.errors }));
  }
  if (capture) await fs.writeFile(option('--output') || 'scratch/recall-live.json', JSON.stringify({ recording, runs }, null, 2));
}
const summary = {};
for (const engine of [...new Set(runs.map(run => run.engine))]) for (const set of ['development', 'generalization']) for (const type of ['all', 'movie', 'tv']) {
  const subset = runs.filter(run => run.engine === engine && run.set === set && (type === 'all' || run.mediaType === type));
  if (!subset.length) continue;
  const average = field => subset.reduce((sum, run) => sum + run[field], 0) / subset.length;
  summary[`${engine}/${set}/${type}`] = { cases: subset.length,
    candidateRecallAt10: average('candidateRecallAt10'), candidateRecallAt20: average('candidateRecallAt20'),
    averagePoolSize: average('candidatePoolSize') };
}
console.log(JSON.stringify({ summary }, null, 2));
if (option('--report')) await fs.writeFile(option('--report'), JSON.stringify({ summary, runs }, null, 2));
if (capture && option('--save-recording')) await fs.writeFile(option('--save-recording'), JSON.stringify(recording, null, 2));
