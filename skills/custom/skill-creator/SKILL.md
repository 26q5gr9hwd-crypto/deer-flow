---
name: skill-creator
description: "Responds to explicit imperative commands to write a new SKILL.md procedure file right now. Command patterns only: 'create a skill for X', 'make a skill about X', 'write a skill for X', 'save this as a skill', 'add a skill for X', 'we should have a skill for X'. Writes competence procedures to _dynamic/. Does not apply when asking about, listing, or querying existing skills."
version: 2
author: vesper
---

## Purpose

This skill has ONE job: when Daniel explicitly commands creating a skill, write the SKILL.md immediately and correctly. Write to `/opt/deer-flow/skills/custom/_dynamic/{skill-name}/SKILL.md` using `task_tool(subagent_type="bash")`.

## Key Principles

- **Create immediately** — if you have enough context, write the procedure file now. Do not defer, over-research, or stall.
- **Write to _dynamic/** — all on-demand procedure files go to `/opt/deer-flow/skills/custom/_dynamic/{skill-name}/SKILL.md`.
- **Do not research unless necessary** — if Daniel just explained the content, or it covers VESPER's own behavior or architecture, write it directly without web search.
- **Do not store domain facts** — facts about Daniel, preferences, project history, or VESPER-specific operational details go to Hindsight via the normal memory pipeline. Skills are for *how to do things* (procedures, patterns, competence), not *what things are*.
- **Skills = competence, not knowledge** — a skill is a reusable procedure. A fact is not a skill.

## Patterns

### Triggering Scenarios

These messages SHOULD trigger this skill (explicit creation commands):
- "create a skill for X" / "create a skill about X"
- "make a skill for X" / "make a skill about X"
- "write a skill for X" / "write a skill about X"
- "save this as a skill" / "save that as a skill"
- "add a skill for X" / "add a skill about X"
- "we should have a skill for X"
- Any message where the user explicitly commands writing a new procedure file

These should NOT trigger this skill (passive queries, not creation commands):
- "what skills do you have?" — a query about existing skills
- "how does the skill system work?" — a question about VESPER internals
- "do you have a skill for X?" — a query, not a creation command
- "use the skill-authoring skill" — a reference to another skill
- "list your skills" / "show me your skills" — listing requests, not creation commands

### Step-by-Step Execution

**Step 1: Extract the skill topic**

Remove trigger words from Daniel's message. The remainder is the topic.

| Input | Topic | Skill Name |
|---|---|---|
| "create a skill for redis caching" | redis caching | `redis-caching` |
| "make a skill about delegation patterns" | delegation patterns | `delegation-patterns` |
| "save this as a skill" | (infer from recent conversation) | (derived from topic) |
| "we should have a skill for error handling" | error handling | `error-handling` |

Convert topic to skill name: lowercase, spaces→hyphens, remove special chars, max 40 chars.

**Step 2: Decide whether to write directly or gather more info**

Write directly (no research needed) if:
- Daniel just explained the content in this conversation
- The topic covers VESPER's own behavior, architecture, or operating patterns
- The topic is something you know well enough to write actionable guidance

Gather more info if:
- The topic requires specific facts you don't have
- Ask Daniel ONE focused question, or use your web tools to gather what's needed — then write

Never ask more than one question before writing.

**Step 3: Compose the SKILL.md**

Frontmatter: