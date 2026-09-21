# Phase 11 deterministic bugfix

The live comparison exposed a deterministic production defect: when the LLM
fallback returned no structured fields, the canonical adapter dropped the raw
intent and vector query text contained only `media_type`. Unrelated movie
searches therefore shared an identical embedding and generic candidate pool.

The correction recovers a bounded set of genres, themes, moods and keywords
only on the no-LLM canonical path. It also refuses to create an embedding from
a media type alone. The legacy rollback path remains unchanged.
