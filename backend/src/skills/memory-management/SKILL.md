---
name: memory-management
description: "Determine what knowledge becomes a skill, what stays in graph memory,
  and when consolidation should trigger. Use when: deciding whether to store
  information as a Graphiti entity or propose a new SKILL.md, evaluating memory
  quality, managing the knowledge lifecycle, running or designing consolidation
  processes, or debugging why a memory isn't being retrieved. Covers: skill
  formation criteria, graph entity retention rules, consolidation triggers,
  memory decay mechanics, and the boundary between procedural and declarative
  knowledge."
---

# Memory Management

## The Core Question: Skill vs. Graph Entity

Every piece of knowledge VESPER acquires must go somewhere. The wrong choice wastes tokens or loses knowledge.

### Store as a Graph Entity (Graphiti) When:
- The knowledge is a **fact** about the world: "Daniel prefers dark mode," "Port 8283 is Letta ACE."
- The knowledge is **episodic**: it happened at a specific time and may become invalid later.
- The knowledge is about **relationships**: "Project X depends on Service Y."
- The knowledge is **uncertain** and may be corrected later.
- The knowledge is **atomic** — a single fact, not a procedure.

### Propose as a Skill (SKILL.md) When:
- The knowledge is **procedural**: a sequence of steps, a workflow, a decision tree.
- The knowledge is **reusable** across multiple conversations or tasks.
- The knowledge is **stable** — unlikely to change frequently.
- The knowledge would replace **5+ individual graph entities** that keep getting retrieved together.
- The knowledge represents a **distilled pattern** from multiple experiences, not a single observation.
- The knowledge is **domain-specific expertise** that improves with practice.

### Decision Rule
Ask: "If I stored this as 5 separate facts in the graph, would the brain keep pulling all 5 together anyway?" If yes -> it's a skill candidate. If no -> keep as individual graph entities.

## Skill Formation Process

### From Raw Experience to Skill

1. **Accumulation** — Individual facts and experiences stored in Graphiti as entities/episodes.
2. **Pattern Recognition** — The consolidation agent detects clusters of related entities (5+ entities about the same topic, frequently co-retrieved).
3. **Distillation** — Related facts synthesized into a procedural skill: successes -> strategic principles, failures -> avoidance rules.
4. **Validation** — Proposed skill checked against existing skills for overlap (cosine similarity > 0.85 = duplicate).
5. **Writing** — Skill written as a SKILL.md file with proper frontmatter to the filesystem.
6. **Testing** — Skill loaded by the progressive loader in subsequent turns. Brain usage tracked.
7. **Evolution** — Skill confidence adjusted: successful use -> reinforce, correction after use -> flag for revision.

### Skill Quality Criteria

A good SKILL.md:
- Has a `description` field comprehensive enough for loader matching.
- Uses imperative form ("Do X") not advisory form ("You should do X").
- Stays under 500 lines — split into references if approaching the limit.
- Includes a "Mistakes to Avoid" section with concrete failure patterns.
- Compresses 10-20x compared to the raw facts it replaces.
- Provides actionable guidance, not general advice.

A bad SKILL.md:
- Duplicates knowledge already in SOUL.md or another skill.
- Contains facts that change frequently (use graph entities instead).
- Is too generic to be actionable ("Be careful with Docker" — useless).
- Is too specific to be reusable ("On March 5, Daniel said to use port 8080" — this is a fact, not a skill).

## Graph Entity Retention Rules

### Importance Levels
- **Critical** — Keep indefinitely. Corrections, explicit preferences, security-sensitive decisions.
- **Normal** — Subject to decay. General facts, observations, inferred knowledge.
- **Fleeting** — Auto-expire after 48 hours. Temporary context, one-off references.

### Strength-Based Decay
- Every entity starts with strength 1.0.
- Each retrieval + use: strength += 0.1 (capped at 2.0).
- Daily decay: strength *= 0.99 (half-life ~69 days).
- Entities below strength 0.3 -> candidates for consolidation or archival.
- Temporal validity (`valid_from` / `valid_to`) handles correctness separately — a corrected fact gets `valid_to = now()` regardless of strength.

### When to Consolidate vs. Archive vs. Delete
- **Consolidate**: 5+ weak entities in the same domain -> distill into a skill, then archive the originals.
- **Archive**: Entity below strength 0.3 with no related cluster -> move to cold storage (queryable but not auto-injected).
- **Delete**: Never. Graphiti's temporal model invalidates facts (`valid_to`) rather than deleting. Preserves provenance.

## Consolidation Triggers

### Automatic Triggers
- **Entity count threshold**: Domain/topic cluster exceeds 10 entities -> flag for consolidation.
- **Correction frequency**: 3+ corrections in the same domain within a week -> needs a skill or skill revision.
- **Retrieval co-occurrence**: Same 5+ entities retrieved together in 3+ conversations -> skill candidate.
- **Strength decay**: 10+ entities in a cluster drop below 0.5 strength -> consolidate before they fade.

### Manual Triggers
- Daniel explicitly requests a skill on a topic.
- A task requires repeated lookup of the same domain knowledge.
- A sub-agent keeps asking the same questions across sessions.

### Consolidation Budget
- Maximum 3 new skills per consolidation cycle (prevents skill explosion).
- Maximum 1 consolidation cycle per day (prevents resource waste).
- Each cycle processes the highest-priority cluster first.

## Mistakes to Avoid

### Don't Turn Everything Into a Skill
- Skills have overhead: frontmatter parsing, loader matching, context injection. A single fact stored in the graph costs ~0 tokens when not retrieved. A skill costs ~30 tokens of metadata even when not loaded.
- If the knowledge is a single fact, keep it as a graph entity.

### Don't Keep Redundant Facts After Skill Creation
- When a skill forms from a cluster of graph entities, archive the originals. Keeping both wastes retrieval budget.

### Don't Ignore Temporal Validity
- A fact with `valid_to` set is historically interesting but operationally dead. Don't let invalidated facts influence current decisions.
- When storing a correction, always set `valid_to` on the old entity. Forgetting this creates contradictions.

### Don't Skip the Description Field
- The `description` in YAML frontmatter is the only thing the progressive loader sees for matching. A vague description means the skill never loads when needed.
- Write descriptions as if answering: "When should an agent use this skill?" List specific scenarios, task types, and keywords.

### Don't Consolidate Too Early
- Wait for 5+ entities before proposing a skill. Three facts about Docker don't justify a Docker skill.
- Premature consolidation produces thin, unhelpful skills that waste loader budget.