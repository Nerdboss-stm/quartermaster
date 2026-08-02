# mandate-arbiter

Deterministic evaluation of spending proposals against signed mandates.
No LLM in the decision path. Fails closed.

A **mandate** is structured authority from a principal (a human) to an
agent: which counterparties, how much per transaction, how much
cumulatively, over what window, under what conditions. The **arbiter**
walks the clause tree against a concrete **proposal** and returns one of
three verdicts:

| Verdict | Meaning |
|---|---|
| `EXECUTE` | Every clause satisfied. The agent may proceed. |
| `REFUSE` | A hard clause failed. The agent may not proceed and may not ask. |
| `NEEDS_HUMAN` | Only escalatable clauses failed. The agent may not proceed, but may ask its principal. |

Escalation is a property the principal grants per clause (`onFail:
"escalate"`), not a behavior the agent chooses. An agent that wants more
authority has exactly one move: ask for a new mandate.

## Semantics

- **Deterministic.** Same inputs, same ledger state, same verdict.
- **Fail closed.** Missing attributes, missing ledger, thrown ledger
  reads, currency mismatch, expired mandate: all fail.
- **Sequential with real timing.** Clauses evaluate in order and emit
  `TraceEvent`s with measured elapsed times. Render the trace by
  replaying it; do not invent pace.
- **Short-circuit.** `all_of` halts at its first failing child.
  `any_of` is exhausted before it fails, and every failing alternative
  co-determines the outcome.
- **Aggregation.** The verdict is `NEEDS_HUMAN` only when *every*
  determining leaf is escalatable. One hard failure anywhere refuses.

## Provenance

Generic, domain-agnostic library authored July 29, 2026, before the
Prava x OpenAI Agentic Commerce Hackathon build window, and disclosed
in that event's submission per its rules. The arbiter design descends
from Greenlight, the author's prior-authorization agent: constraint
tree, deterministic verdicts, fail-closed defaults.
