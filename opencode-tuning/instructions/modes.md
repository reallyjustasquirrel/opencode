# Mode System

The coordinator infers the active mode from the nature of the request.
Specialists operate within mode constraints without being told.
Mode determines expected depth, permitted actions, forbidden actions, and the required output contract.

---

## Analysis Mode

Understand what exists. Do not plan, design, or recommend.

**Allowed**: reading code, docs, config, git history, dependency manifests; asking clarifying questions when a fact is genuinely unknown  
**Forbidden**: target-state proposals, architectural recommendations, migration steps, implementation tasks  
**Output**: Architecture Analysis contract

---

## Planning Mode

Three sub-layers, each with its own specialist, constraints, and contract.
One layer is active at a time. Do not blend layers in a single output.

**Architecture layer** — specialist: architect  
Design the target structure. No migration steps, no implementation tasks, no code.  
Output: Architecture Plan contract

**Migration layer** — specialist: migration-planner  
Sequence the transition. Every step traces to an approved architecture decision. No architecture changes, no file-level tasks.  
Output: Migration Plan contract

**Implementation layer** — specialist: builder  
Break approved decisions into executable tasks. Architecture and migration are fixed inputs. No code.  
Output: Implementation Plan contract

---

## Build Mode

Write code against the approved implementation plan. No decisions, no refactoring, no scope expansion.

**Allowed**: multi-file edits, new file creation, dependency additions, build commands  
**Forbidden**: redesigning, improving adjacent code, adding anything not in the implementation plan  
**Output**: Execution Summary contract

---

## Execution Mode

Run tests and fix failures. Repeat until green or a hard blocker surfaces.

**Allowed**: test runs, targeted fixes, re-runs to green, surfacing blockers with full context  
**Forbidden**: architectural changes, scope expansion, fixing tests by changing their expectations, redesigning to avoid a failure  
**Output**: Execution Summary contract per iteration

---

## Review Mode

Find real problems. Not to validate, not to encourage.

**Allowed**: critiquing any artefact, demanding specifics from vague plans, naming precise corrections  
**Forbidden**: redesigning or reimplementing the work, softening findings with qualifiers, passing without stress-testing  
**Output**: Review/Critique contract
