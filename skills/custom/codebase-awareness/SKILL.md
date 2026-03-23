---
name: codebase-awareness
description: "Navigate and understand VESPER's own codebase at /opt/deer-flow. Use
  when: reading or modifying VESPER source code, understanding module responsibilities,
  debugging VESPER behavior, planning code changes, delegating to vesper-code-reader
  or vesper-code-writer, or building a mental model of the system architecture.
  Covers: directory structure, key modules, service boundaries, the sub-agent
  delegation pattern for code tasks, and how to efficiently explore unfamiliar code."
---

# VESPER Codebase Awareness

## Architecture Mental Model (~200 tokens)

VESPER is a DeerFlow-based AI agent system. The brain (GLM-5) handles reasoning and decisions. Sub-agents (gpt-oss-120b) handle heavy I/O: code reading, code writing, web research. Memory is layered: Hindsight (hindsight-all package, port 8888) for temporal knowledge with bank_id='vesper' and Postgres DB 'vesper', Postgres for operational state + skill embeddings, filesystem for skills (SKILL.md) and identity (SOUL.md). The conversation pipeline: vesper-gateway (port 8001) -> context assembly (middleware) -> brain LLM call -> tool execution -> response. Extraction runs async after each turn via retain() calls to Hindsight.

## Runtime Source of Truth

- **Live custom skills:** `/opt/deer-flow/skills/custom/`
- **Skill loader code + dev/reference skill copies:** `/opt/deer-flow/backend/src/skills/`
- **Canonical runtime agent config:** `/opt/deer-flow/backend/.deer-flow/agents/vesper/config.yaml`
- **Canonical context identity file:** `/opt/deer-flow/backend/vesper_soul.md`
- **Lead-prompt SOUL mirror used by DeerFlow agent loading:** `/opt/deer-flow/backend/.deer-flow/agents/vesper/SOUL.md`

Treat `backend/src/skills/` as loader code plus development/reference content, not as the live deployed custom skill directory. Treat `backend/agents/vesper/` as redirected dead-copy paths, not runtime sources of truth.

## Key Directories

### `/opt/deer-flow/backend/src/`
- `agent/` or `agents/` — Brain agent definition, tool registration, prompt templates. The newer structure uses `agents/` with `lead_agent/`, `memory/`, and `middlewares/` subdirectories.
- `skills/` — SKILL.md files loaded by the progressive loader. Each subdirectory = one skill.
- `tools/` — Tool implementations available to the brain (memory search, code delegation, etc.).
- `memory/` or `agents/memory/` — Memory extraction pipeline (updater.py), context assembly (middleware). Writes to Hindsight.
- `api/` — Webhook endpoints, REST API handlers.

### `/opt/deer-flow/backend/src/memory/` (or `agents/memory/`)
- `updater.py` — Extraction pipeline: conversation turn -> LLM extraction -> Hindsight storage via retain().
- `memory_middleware.py` (or `vesper_context_middleware.py`) — Context assembly: builds system prompt from all memory layers including Hindsight recall.
- `prompt.py` — Extraction prompt templates (what to extract, what to skip).

### `/opt/deer-flow/backend/src/skills/`
- Each subdirectory contains a `SKILL.md` with YAML frontmatter.
- The loader reads frontmatter for metadata (~30 tokens per skill).
- Full skill body loaded on-demand when task matches description.

### `/opt/deer-flow/docker/`
- `docker-compose.yml` — Service definitions (brain, webhook, postgres, hindsight).
- `provisioner/` — Database initialization, schema migrations.
- `Dockerfile` — Build configuration for the main service.

### Other Important Paths
- `/opt/deer-flow/SOUL.md` — Identity file, always injected (~165 tokens).
- `/opt/deer-flow/backend/src/config/` — Environment config, model settings, API keys.
- `/opt/deer-flow/backend/src/sub_agents/` — Sub-agent definitions (code-reader, code-writer).

## Hindsight Memory Backend

Hindsight replaced Graphiti+FalkorDB as the memory backend. All memory operations go through Hindsight's REST API.

- **Package:** `hindsight-all` 0.4.19
- **Port:** 8888 (local service)
- **Bank:** `bank_id='vesper'`, Postgres DB: `vesper`
- **Postgres tables (26):** `banks`, `memory_units`, `entities`, `memory_links`, `chunks`, and others

**API Endpoints:**
- `retain()` -> `POST /v1/default/banks/vesper/memories` — store a new memory
- `recall()` -> `POST /v1/default/banks/vesper/memories/recall` — retrieve relevant memories

**Test:**

## Recent Changes (Auto-Updated)
_Last indexed: 2026-03-23 02:34 UTC_

The update removes the old Mem0 memory backend and re‑routes all structured memory look‑ups to the new **vesper_hindsight** module, which now provides `search_memories_sync` for synchronous calls during context assembly. Additionally, `vesper_context.py` now pulls the SOUL description, current UTC time (with last‑interaction delta), and active Postgres‑stored projects/tasks into the prompt, consolidating all contextual sources into a single ~800‑1,700‑token block. These changes streamline VESPER’s architecture by centralizing memory access through Hindsight and enriching the prompt with up‑to‑date project and timing data, improving relevance while reducing token bloat.

Changed files: backend/vesper_context.py, backend/vesper_hindsight.py
