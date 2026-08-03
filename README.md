# Quartermaster

**Petty cash for AI agents.**

At 3:12 in the morning my training run died. Out of GPU memory, forty thousand
steps in, nobody awake to fix it.

My agent went and found compute. It haggled, got the price down as far as the
seller would go, and then it stopped. Forty seven dollars, and I had only ever
allowed forty. So it texted me and waited.

That pause is the whole product. Not that an agent can spend money, anyone can
build that. That it knows when not to.

**Try it:** https://quartermaster-theta.vercel.app
Open signup. Bring your own email and phone, we hand you a sandbox card.

**Watch one that already happened**, no account needed:
[run_1785715102272_e6lazl](https://quartermaster-theta.vercel.app/r/run_1785715102272_e6lazl)

## The problem nobody wants to say out loud

We are all building agents that can act. Almost none of us would hand one a
credit card and go to sleep.

Today you get two choices. Give it your card and hope. Or approve every
purchase yourself, which means you may as well have done the buying. Neither
of those is autonomy. One is recklessness and the other is a chore with extra
steps.

## Two locks stand between an agent and your money

**Lock 1 is your policy, and it is checked on every single charge.** A signed
clause tree: the most per purchase, the most in total, what may be bought and
from whom. A deterministic arbiter walks it before any money call is made. No
model sits anywhere in that decision. If the answer is no, we never even reach
for the card, so a refusal costs nothing.

**Lock 2 is the card network, and you grant it once with your passkey.** A
Prava envelope, scoped to one merchant, capped per charge, good for a single
charge per weekly cycle. Visa enforces those three, outside my code.

That second one is the part I would want to know about if I were you. If my
arbiter were wrong, my router were wrong and my ledger were wrong, all at the
same time, those limits would still hold. I cannot lift them from my side. My
bugs cannot lift them either.

Loosening your policy never widens an envelope. More spending power always
costs another fingerprint.

## What actually happens

1. You say what you need. 80GB of GPU, four hours, forty dollars at most.
2. Your agent goes looking. It runs on the OpenAI Agents SDK, tool calls only.
   It reads the market, asks a seller for a firm price, and pushes back once if
   the price is too high. You watch it happen in plain English, line by line,
   rather than staring at a spinner.
3. The arbiter walks your policy clause by clause. Forty seven against a cap of
   forty is a refusal, not a purchase.
4. It stops and texts you over Linq. You reply `RAISE CAP TO $50` from bed.
5. That reply is parsed by strict regex, never by a model, because a text that
   authorises money is the last place I want something guessing. A brand new
   mandate gets signed, superseding the old one. Mandates are immutable here.
   Amendments are new mandates, and cumulative spend carries across the whole
   chain, so raising a cap can never quietly reset what you have already spent.
6. The router picks an envelope that still has capacity this cycle, checked
   against our own ledger before we ever call Prava.
7. Prava mints a one time merchant scoped credential, the seller gets paid, the
   charge is reported back to the network, and a ledger row records exactly
   which clauses allowed it.

You wake up to a receipt instead of a surprise.

## Proof, not adjectives

First real settlement on the deployed app:

| | |
|---|---|
| Amount | `$18.00` |
| Transaction | `txn_01KZ2EMFY451N7YDDKSKERSFBX` |
| Envelope | `mdt_01KZ2C3KXMQSQANV0PK1DARJ7E` |
| Human in the loop | none |

That run is public. It replays at the pace the decisions actually happened,
and the audit bundle downloads as JSON with the full mandate chain and every
clause the arbiter evaluated.

## What is real, and what is not

Being straight about this matters more to me than looking finished.

**Real.** The Prava charge. The caps the network enforces. The one charge per
cycle rule, which I learned the hard way. The reported transaction. The
append only ledger. The text messages. The arbiter. The negotiation.

**Not real yet.** Sellers who sign up here do not get paid out. The platform is
merchant of record and it collects the money. The product says that on screen,
in the seller's own dashboard, rather than showing them a number and letting
them assume. Building that payout is the next thing.

**Sandbox.** Every surface says so. No real money moves.

## The other side is a person

Compute here is sold by a merchant running on its own host, and by people who
signed up and listed the card sitting idle in their spare room. Both publish to
the same registry. Both get asked for a price by the same code. The buying
agent genuinely cannot tell which is which, and neither can the arbiter.

Somebody's gaming PC in a garage earns money at three in the morning while they
sleep, because a machine somewhere needed it and was allowed to say yes.

That is the part I would keep building even if nobody hands me a prize for it.

## Layout

```
apps/console               Next.js app: product, arbiter wiring, ledger, webhooks
apps/agent-b               Hono merchant on its own host (Fly.io)
packages/mandate-arbiter   Deterministic clause evaluation (pre-existing, MIT)
packages/prava-client      Typed wrapper over the Prava REST API
packages/escalation        Channel agnostic escalation, strict reply parsing
nanda-adapter              NANDA Town Payments plugin (Python)
scripts/migrations         Portable SQL, runs on SQLite and Postgres
```

Storage is SQLite locally and Neon Postgres in production, behind one async
seam, so the same code runs against both.

## Run it yourself

```bash
pnpm install
cp .env.example .env      # Prava, OpenAI and Linq keys
pnpm db:migrate
pnpm seed:personas        # sample sellers, so the market is not empty
pnpm dev
```

`pnpm demo:core` runs the entire loop headless and ends where it should. It
spends nothing:

```
VERDICT  NEEDS_HUMAN
FAILING  root.all_of[3] [amount_cap] onFail=escalate
DETAIL   amount $47.00 exceeds cap $40.00
```

## Integrations

**Prava.** Sessions, envelopes, charges, reports. This is the spine of the
product, not a checkout button bolted on at the end.

**Visa Intelligent Commerce**, through Prava. Merchant scope, per charge cap
and the cycle limit, all enforced at the network.

**OpenAI.** Agents SDK, tool calls only. It negotiates and it narrates. It has
no vote on whether money moves.

**Linq.** iMessage escalation and receipts, signed webhooks, strict regex
replies, and settlement driven by your answer while you go back to sleep.

**NANDA.** Payments plugin submitted as
[projnanda/nandatown#216](https://github.com/projnanda/nandatown/pull/216).
Their full CI passes locally: ruff, format, pyright strict, 1323 tests.

## Disclosed as pre-existing

- `packages/mandate-arbiter` (published, MIT, generic)
- An SSE trace pattern from Greenlight, an earlier project of mine
- Repo scaffold, deploy pipelines, design tokens, docs copies
- Two hand run sandbox verifications, ids recorded in `docs/prava.md`

No product code existed before the window. Everything else was built inside it.

---

Built for the Agentic Commerce Hackathon (Prava x OpenAI), August 2026.

*Give your agent an allowance, not your wallet.*
