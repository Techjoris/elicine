# Phase 6 — Canonical vector retrieval

## Targeted audit

The repository contained two incompatible vector schemas:

- `movie_profiles.embedding` and `movie_titles.embedding_title`: `vector(1024)`
  with HNSW indexes, but no checked-in RPC or embedding generator used by search;
- `movies_embeddings.embedding`: `vector(1536)` with HNSW and the legacy
  `match_movies` RPC. The only identified model reference was an example naming
  `text-embedding-3-small`. The historical browser service accepts an optional
  caller-supplied vector, but its current caller does not provide one.

The server action `action=vector` and browser `supabaseVectorSearch.ts` still
contain legacy `match_movies` compatibility code. They are outside the canonical
Phase 5 pipeline and are now obsolete for canonical retrieval. The old tables,
RPC, and data are deliberately not deleted or converted.

The live Supabase catalogue could not be introspected from the workspace because
no local Supabase credentials or CLI project configuration are present. The
checked-in SQL and active call sites are therefore the authoritative audit scope.

## Canonical architecture

Canonical retrieval uses only:

- model: `text-embedding-3-small`;
- dimension: exactly `1024`, requested through the provider `dimensions` field;
- version: `text-embedding-3-small:1024:v1`;
- table: `media_embeddings` for both `movie` and `tv`;
- RPC: `match_media`;
- Phase 5 source: `supabase_vector`.

`VECTOR_RETRIEVAL_ENABLED` is enabled by default after the targeted Phase 6
validation. Setting it explicitly to `false` removes the source immediately;
all other Phase 5 sources keep running unchanged.

`match_media` accepts a 1024D query vector, optional media type, bounded limit,
similarity threshold, and mandatory embedding version. It uses cosine distance
and the canonical table has one HNSW index. The server validates the dimension
before making the RPC. A request-scoped promise permits at most one query
embedding for each search.

`buildMediaIndexText` is the shared deterministic profile builder for movies and
TV. It uses existing titles, overview, tagline, genre IDs/names, keywords,
themes, moods, setting, date, and original language. It never serializes a raw
user query.

## Reindexing

`scripts/reindex-media-embeddings.mjs` is dry-run by default. It plans at most 10
rows by default and caps an invocation at 100 rows, with batches capped at 50.
Only `--apply` embeds and upserts. Existing `movies_embeddings` or `movies` rows
can seed movie profiles; a JSON input may contain typed TV rows.

Examples:

```bash
node scripts/reindex-media-embeddings.mjs --limit=10
node scripts/reindex-media-embeddings.mjs --input=sample.json --limit=10
node scripts/reindex-media-embeddings.mjs --input=sample.json --limit=10 --batch-size=5 --apply
```

The Phase 6 test suite runs the apply path against two injected records (one
movie and one TV series) without network or database writes. No mass reindex was
run.
