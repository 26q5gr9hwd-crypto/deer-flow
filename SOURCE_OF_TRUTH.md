# VESPER Runtime Source of Truth

Updated: 2026-03-23

## Active runtime artifacts

| Artifact | Canonical path | Notes |
|---|---|---|
| Runtime working directory | `/opt/deer-flow/backend` | Both systemd services run from here |
| Runtime agent config | `/opt/deer-flow/backend/.deer-flow/agents/vesper/config.yaml` | Canonical DeerFlow agent config |
| Context identity file | `/opt/deer-flow/backend/vesper_soul.md` | Used by context assembly |
| Lead-prompt SOUL mirror | `/opt/deer-flow/backend/.deer-flow/agents/vesper/SOUL.md` | Used by DeerFlow lead-agent loading |
| Live custom skills | `/opt/deer-flow/skills/custom/` | Runtime-loaded custom SKILL.md files |
| Public DeerFlow skills | `/opt/deer-flow/skills/public/` | Upstream/public skill set |
| Hindsight wrapper | `/opt/deer-flow/backend/vesper_hindsight.py` | Runtime memory access |

## Dead or redirected copies

| Path | Status | Action |
|---|---|---|
| `/opt/deer-flow/backend/agents/vesper/SOUL.md` | Dead copy | Redirect marker only |
| `/opt/deer-flow/backend/agents/vesper/config.yaml` | Dead copy | Redirect marker only |

## Legacy or reference-only paths

| Path | Status | Notes |
|---|---|---|
| `/opt/deer-flow/backend/src/skills/` | Dev/reference | Contains loader code and some reference SKILL.md copies. Not the live custom skill root. |
| `/opt/deer-flow/backend/*.graphiti_backup` | Legacy | Graphiti-era backup files. Do not treat as runtime code. |
| `/opt/deer-flow/backend/*.bak.*` | Legacy | Historical backup snapshots. Do not treat as runtime code. |

## Intentionally separate

These remain separate on purpose:

- `vesper_soul.md` and `.deer-flow/agents/vesper/SOUL.md`
	- The first feeds VESPER context assembly.
	- The second is the DeerFlow lead-agent SOUL file.
	- They should stay semantically aligned, but they are used by different runtime paths.

- `skills/custom/` and `backend/src/skills/`
	- `skills/custom/` is the live deployed custom skill directory.
	- `backend/src/skills/` contains loader code plus development/reference copies.

## Practical rule

If you are unsure where to edit, start here:

1. Behavior or runtime comments → `backend/`
2. Live custom skill content → `skills/custom/`
3. DeerFlow agent config → `backend/.deer-flow/agents/vesper/config.yaml`
4. Identity/context text → `backend/vesper_soul.md`
