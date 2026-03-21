---
name: hindsight-internals
description: "VESPER's memory system internals. Use when: debugging memory failures, deciding what to retain, understanding how recall() works, inspecting Postgres memory tables, or tracing why a memory was or wasn't stored. Covers: Hindsight architecture, retain() and recall() endpoints verified against actual code, Postgres schema, when to call retain(), and how to inspect own memory."
---

# Hindsight Internals — VESPER Memory System

## What is Hindsight

Hindsight is VESPER's semantic memory backend. Version: `hindsight-all 0.4.19`. Runs on port `8888` on localhost. Backed by Postgres database named `vesper`.

All VESPER memories live in `bank_id='vesper'`.

Python wrapper: `/opt/deer-flow/backend/vesper_hindsight.py` — provides `retain()`, `search()`, and `reflect()` async functions.

---

## retain() — How Memories Are Stored

Triggered after: task completions, key decisions, errors/fixes, learned patterns, confirmed tool outputs.

**Python call:**