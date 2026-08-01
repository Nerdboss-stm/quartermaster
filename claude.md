## What we are building
Quartermaster. Two AI agents trade compute and settle money under an
enforceable, human-granted envelope portfolio. Agent A (buyer) hits
a GPU capacity wall at 3 AM. Agent B (seller, a real merchant on its
own host) quotes. A deterministic arbiter checks every charge
against a human-signed policy mandate, then ROUTES it to an envelope
with cycle capacity. Refusals escalate to the owner's iMessage.
Inside the approved portfolio, the agent transacts autonomously.
Every cent lands in an append-only ledger attributed to a mandate
clause and an envelope.

## The core story (use these words everywhere)
Two locks stand between an agent and money.
LOCK 2, BIOMETRICS, once per ENVELOPE: the owner's passkey approves
each bounded envelope (merchant-scoped, per-charge-capped, one
charge per weekly cycle, enforced by the Visa network).
LOCK 1, POLICY, on EVERY CHARGE: the deterministic mandate decides
whether any draw may happen at all, and the router decides which
envelope has cycle capacity to fund it.
Approve the portfolio at dinner. The agent transacts at 3 AM,
bounded. To exceed policy, it must come back and ask you. To exceed
the portfolio, it must get your fingerprint again.

VERIFIED EMPIRICALLY Jul 31, 7 PM ET, by hand in sandbox: Visa
enforces ONE charge per envelope per payment cycle at the network
level. A second same-cycle draw returns status "failed", errorCode
DECLINED, message "Purchase already made in the current payment
cycle". max_charges means number of cycles, not concurrent draws.
THE DESIGN: an ENVELOPE PORTFOLIO. Beat 1: the owner approves TWO
envelopes in one evening scene, two passkey taps (Envelope A:
$60/week, compute; Envelope B: $20/week, incidentals). The arbiter
ROUTES each charge to an envelope with cycle capacity; routing
renders on screen. Beat 9 draws Envelope A. Beat 11 draws Envelope
B, zero human touches. The code NEVER attempts a second same-cycle
draw on one envelope; the cycle-DECLINED error is treated as a
fail-closed routing refusal if it ever appears.
Verified ids: mandate A mdt_01KYX757C6B9Y621NZ0K116710 ($47 charged,
completed), mandate B mdt_01KYX7GJZC63YE9V05RNKMBK46 ($18 charged,
completed, no passkey). Enrolled demo card: 7797 in Chrome; Chrome
returning-flow is passkey-only. Do not reuse card 7789.
Never claim unbounded autonomy. Bounded is the product.

## The twelve demo beats (never break these)
1.  Evening. The owner approves an ENVELOPE PORTFOLIO: two passkey
    taps, about eight seconds each. Envelope A, $60/week, compute.
    Envelope B, $20/week, incidentals. LOCK 2 on camera, twice.
2.  3:12 AM. Agent A hits a capacity wall. Real error, real logs.
3.  Discovery. Agent A broadcasts a Need. Agent B answers.
4.  Negotiation flash. Agent A asks for better; Agent B drops 10
    percent once or holds. One visible exchange. Quote: $47.
5.  Mandate evaluation. Arbiter walks every clause on screen.
6.  REFUSE. $47 vs the $40 per-charge policy cap. Hard stop. LOCK 1.
7.  Escalate. iMessage to the owner: APPROVE, DECLINE,
    RAISE CAP TO $X.
8.  The owner replies RAISE CAP TO $47 from bed. Amendment = a NEW
    signed policy mandate superseding the old. No new passkey:
    policy changed, envelopes did not. Re-eval: EXECUTE.
9.  Settlement. The router selects Envelope A (merchant match, cap
    fits, cycle open). Fresh one-time merchant-scoped credential,
    no passkey. Agent B paid. Third-party proof on screen with the
    SANDBOX badge.
10. Agent B provisions real compute. Agent A's job finishes.
11. Hours later. A second need. Quote $18. Arbiter: EXECUTE. Router:
    Envelope A's cycle is spent, routes to Envelope B. Draw and
    settle with ZERO human touches. NO HUMAN IN LOOP badge.
    Portfolio meter: $65.00 of $80.00 this cycle; policy cumulative
    $65.00 of $120.00.
12. The ledger and the audit bundle. Every cent attributed to a
    clause AND an envelope. Downloadable. Replayable.

## Hard laws (violating any of these is a bug)
1. The LLM NEVER decides whether money moves. Only the arbiter
   decides, and only the router selects funding. The LLM narrates,
   negotiates, calls tools. The code obeys EXECUTE, REFUSE,
   NEEDS_HUMAN, and the router's selection.
2. Fail closed. Missing data, missing ledger, thrown errors,
   currency mismatch, expired mandate, NO ENVELOPE WITH CYCLE
   CAPACITY: the answer is NO.
3. NEVER attempt a second same-cycle draw on one envelope. Cycle
   eligibility is checked in OUR ledger before any Prava call. If
   the network cycle-DECLINED error ever fires, it is a router bug:
   log it, fail closed, alert.
4. Mandates are immutable. Amendments are new mandates, recorded.
5. Honesty labels. SANDBOX or PRODUCTION visible on every surface.
   Never present a simulated step as real. Never overstate autonomy.
6. No secrets in code or logs. Card and token values as last 4 only.
7. TRANSACTION BUDGET: about 90 sandbox transactions remain.
   Budget: 55 build and test, 20 Sunday recording, 15 guest runs
   and reserve. Batch tests. No idle retry loops.
8. Keep it simple. One job per file. Boring code that works.

## Task-to-doc map (mandatory reads BEFORE touching these areas)
- Prava (sessions, envelopes, charges, reports, test cards): read
  docs/prava.md first, every time, INCLUDING the section
  "ENVELOPE MECHANICS VERIFIED" at the bottom.
- Linq (send, webhook, signature): read docs/linq.md and the
  captured webhook payload first.
- NANDA (adapter, protocol, PR): read docs/nanda.md first.
- Stripe Checkout: read docs/stripe.md first.
- Mandate/arbiter: read packages/mandate-arbiter/README.md.
  Never modify that package.
- Doc silent or missing: STOP and say so. Any unavoidable guess
  lives in one adapter file with a VERIFY comment.
- Docs win over code, memory, and training data.

## Stack (do not substitute)
- TypeScript everywhere except the NANDA adapter (Python 3.12).
- apps/console: Next.js 14 App Router + Tailwind. UI, registry,
  ledger, webhooks, SSE, guest runs, replay, audit bundle.
- apps/agent-b: Hono on Node, separate host (Fly.io).
- packages/mandate-arbiter: PRE-BUILT AND DISCLOSED. Import only.
- packages/prava-client: thin typed wrapper over Prava REST.
- packages/escalation: channel-agnostic; LINQ IS LIVE and default;
  console adapter is fallback and guest surface.
- better-sqlite3, db/quartermaster.db.
- @openai/agents, model from env OPENAI_MODEL, tool calls only,
  low temperature.
- Playwright: production checkout only, never sandbox.

## Design law for all UI (banned styles are BANNED)
Reference class: trading desk, flight control, ledger.
- BANNED: purple/indigo gradients, glassmorphism, emoji in labels,
  rounded-everything, centered hero, generic card grids, neon-dark.
- Four fixed regions, no scrolling: Agent A left, Agent B right,
  mandate center, ledger rail bottom.
- JetBrains Mono for every number, id, timestamp, amount,
  tabular-nums. Inter for prose only.
- Three signal colors plus neutrals. Color only on state.
- The refusal is visually violent: cascade halts, the failing clause
  is the only colored element on screen.
- The ENVELOPE PORTFOLIO panel is always visible: each envelope with
  label, per-charge cap, cycle state (OPEN or USED), renewal date,
  and the portfolio meter in tabular numerals: $65.00 OF $80.00.
- ROUTING renders as a first-class trace step: which envelope, why
  ("A: cycle spent -> B: selected").
- The autonomous beat gets a distinct marker: NO HUMAN IN LOOP badge
  on ledger rows executed without escalation.
- Millisecond timestamps. Full ids, never truncated.

## Environment facts
- Prava sandbox: PRAVA_BASE_URL, PRAVA_SECRET_KEY (sk_test_) in
  .env. Eleven test cards + test OTP 456789 in docs/prava.md.
  Enrolled demo card 7797 (Chrome, passkey-only on return).
- One charge per envelope per cycle, network-enforced. Verified.
- Linq: GRANTED. Keys set; webhook at CONSOLE_URL/api/webhooks/linq;
  captured payload in docs/linq.md. ESCALATION_CHANNEL=linq default.
- Deadline Sunday Aug 2, 3:00 PM PT (6:00 PM ET). File 3:00 PM ET,
  edit until the wire.
- Discord routing: #support and Birdie general; Visa/Prava track
  channel for PRODUCTION (Sat morning, verified ids attached);
  Linq channel for Linq; NANDA channel Sunday; #showcase launch.

## What existed before the build window (disclosed)
- packages/mandate-arbiter (published, MIT, generic).
- SSE trace pattern from Greenlight (author's prior project).
- Repo scaffold, deploy pipelines, design tokens, docs copies.
- Hand-run sandbox verification (two mandates, two charges) with
  ids recorded in docs/prava.md. No product code existed.
Everything else is built in-window.