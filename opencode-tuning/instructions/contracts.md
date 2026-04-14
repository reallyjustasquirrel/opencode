# Output Contracts

Specialist output must match the relevant contract.
No freeform responses for specialist work.
A missing section is a malformed output — omit only if the section genuinely cannot apply, and state why.

---

## 1. Architecture Analysis

```
## Current State
One paragraph. What the system is, how it is structured, what it does.

## Key Components
List. Per component: name — responsibility — boundaries — coupling level (tight/loose/unknown)

## Dependencies
Internal: component-to-component with direction and coupling type.
External: libraries, services, APIs. Note version pins, undocumented contracts, implicit coupling.
Flag cycles.

## Constraints
Hard constraints the target design must respect. Technical, operational, organisational.
Do not list preferences or nice-to-haves here.

## Risks
Fragile areas, missing abstractions, unknown dependencies, areas that will resist change.
Per risk: what it is — where it lives — what it blocks.

## Target-State Signals
High-level design signals only. One sentence each. No migration steps, no file paths.
Omit if analysis is genuinely insufficient to form a signal.

## Open Questions
Specific facts that must be known before planning can begin.
Not rhetorical. Not obvious. Things that block a decision.
```

---

## 2. Architecture Plan

```
## Target Structure
Packages, modules, services, layers, boundaries. Drawn as a list or diagram.
Every component named. Every boundary stated explicitly.

## Design Decisions
Per decision: Decision — Rationale — Alternatives rejected and why.
Every significant structural choice must appear here.
If a decision is not here, it is not approved.

## Module Boundaries
What belongs in each module. What must not cross boundaries. Enforcement mechanism if any.

## Public APIs and Interfaces
Type signatures, event shapes, or schemas — not implementation code.
One entry per public contract. Note which components own and which consume each contract.

## Assumptions
What this design depends on being true.
Per assumption: the claim — what breaks if it is false.

## Risks and Tradeoffs
What this design sacrifices. Where it will break under load, scale, or edge cases.
Do not omit known weaknesses.
```

---

## 3. Migration Plan

```
## Phases
Per phase: Phase N — Name — Goal — Entry condition — Exit condition
Each phase must be independently deployable or rollback-safe. No phase may leave the system
in a state that cannot be rolled back.

## Ordered Steps
Numbered. Per step: [action] — depends on: [step numbers] — validates: [what must be true after]
Every step must be traceable to an architecture decision. Cite it.

## Coexistence Strategy
How old and new run simultaneously. Which traffic or data goes where.
How data consistency is maintained across both. Duration and termination condition.

## Rollback Strategy
Per phase: trigger condition — procedure — execution time window — data loss exposure.
A migration plan without per-phase rollback is incomplete.

## Validation Strategy
Per phase: the specific tests or checks that must pass before the phase is complete.
Name the tests. Do not write "tests pass."

## Cutover Risks
Per risk: failure mode at the switch point — probability — mitigation — residual exposure.
```

---

## 4. Implementation Plan

```
## Tasks
Numbered. Per task: name — what gets built or changed in one sentence.
Every task must be executable by the executor without asking a question.
If a task requires a decision, it is not concrete enough.

## Target Files
Per task: exact file paths created / modified / deleted. No wildcards, no "relevant files in src/".

## Sequence
Order of implementation. Per dependency: task N requires task M.
Identify tasks that can execute in parallel.

## Coding Notes
Per task: implementation guidance. Not architecture — that is decided.
Patterns to follow, pitfalls to avoid, existing utilities to reuse, edge cases to handle.

## Tests
Per task: test file paths and case names. For new tests: what they verify and pass criteria.
For ported tests: source location. "Add tests" is not acceptable here.

## Completion Criteria
What done looks like for the full plan: specific tests passing, specific integrations verified,
specific regressions checked. Not "all tests green."
```

---

## 5. Review / Critique

```
## Verdict
Pass | Conditional pass | Fail — one sentence rationale.

## What Holds
Only include entries that survived specific stress-testing.
State what was tested and why it held. Do not list generic strengths.
If nothing was stress-tested successfully, omit this section.

## Problems
Per problem: location — consequence — severity (blocking | significant | minor)
Blocking: the plan cannot proceed as written.
Significant: will cause failure or rework at implementation or production.
Minor: should be fixed; does not block progress.
Do not use qualifiers: "might", "could", "may want to". State the consequence directly.

## Contradictions and Omissions
Internal inconsistencies: where the plan contradicts itself.
Omissions: things assumed but not stated, decisions deferred without acknowledgement.
Per entry: what is missing or contradicted — where — why it matters.

## Recommended Corrections
Per problem: the specific change required — which specialist owns the fix.
Not "consider adding X." State what to add, where, and why the current state is insufficient.
```

---

## 6. Execution Summary

```
## Scope Executed
One sentence: what implementation plan task(s) this execution covers.

## Files Touched
List. Per file: path — change type (created | modified | deleted) — one-line description of change.

## Tests Run
Test suite(s) run. Pass / fail / skip counts.

## Failures
Per failure: test name — error message — file and line if available.

## Fixes Applied
Per failure: what changed — in which file — why this fix addresses the root cause (not the symptom).

## Remaining Issues
Unresolved failures, hard blockers, decisions required before execution can continue.
Per issue: what is blocked — what specific input is needed to unblock it.
```
