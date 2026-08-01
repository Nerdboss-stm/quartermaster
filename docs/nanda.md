# docs/nanda.md
# Compiled Jul 31, 2026 from nandatown.projectnanda.org/pravahack and
# /docs (fetched today). Sunday stretch track only. $1,000 OpenAI
# credits. Ramesh Raskar judges; this is his initiative.

=====================================================================
1. THE TRACK, VERBATIM REQUIREMENTS (pravahack page)
=====================================================================
Build a reliable, reusable Prava payments adapter for NANDA Town:
agents quote, pay, verify transactions, and handle failures using
Prava's Agentic Payments Sandbox. Optionally run commerce
simulations (autonomous buyers, sellers, negotiations, budgets,
retries).
Evaluated on: adapter quality and reliability; security,
authorization, and failure handling; ease of installation and reuse;
successful Prava sandbox transactions; quality of scenarios or
simulations on top.
SUBMISSION = BOTH PARTS REQUIRED:
1. Build the adapter as a NANDA Town PAYMENTS-LAYER PLUGIN (payments
   layer covers quote, pay, verify, refund). Follow the Writing a
   Plugin guide.
2. Connect to Prava's sandbox; show AT LEAST ONE successful sandbox
   transaction in a scenario run; include the scenario AND a test;
   handle AT LEAST ONE failure case.
3. Open a PR to github.com/projnanda/nandatown carrying the plugin,
   the scenario, the test, and a README (installation + reuse). It
   appears in the Payments layer of the PR gallery.
4. Submit on Devfolio and LINK THE PR in the Devfolio submission.

=====================================================================
2. INSTALL (from /docs)
=====================================================================
Python 3.12+ required (older fails with a requires-python error).
  python3.12 -m venv .venv && source .venv/bin/activate
  pip install "nest-core[plugins]"     # quotes matter on zsh
  nest doctor                          # 7/7 checks
Engine and CLI are called nest. Traces write to ./traces/*.jsonl
relative to the working directory.
Sanity run: nest run marketplace ; nest inspect traces/marketplace.jsonl ;
nest report traces/marketplace.jsonl -o report.html

=====================================================================
3. THE LAYER MODEL AND PLUGIN PATTERN (from /docs)
=====================================================================
Twelve swappable layers; payments default is prepaid_credits
(play-money balances and transfers). Agents reach a layer with
ctx.plugins.get("payments"). A plugin is a Python class with the
methods the layer expects; reference implementations live in
packages/nest-plugins-reference/ in the repo. REGISTER via entry
points:

pyproject.toml:
  [project]
  name = "nest-plugin-prava"
  version = "0.1.0"
  dependencies = ["nest-core", "httpx"]
  [project.entry-points."nest.plugins.payments"]
  prava = "nest_plugin_prava.plugin:PravaPayments"

Scenario YAML then selects it:
  layers:
    payments: prava

Scenario base: copy marketplace.yaml (nest scenarios cp), Tier 1
(scripted, seeded, free, repeatable) first; Tier 2 (LLM brains) only
if time allows. Failure injection exists (message_drop,
byzantine_agents) and suits our failure-case test.

=====================================================================
4. QUARTERMASTER MAPPING
=====================================================================
The plugin calls OUR console HTTP API, which calls Prava. Honest and
thin:
  async quote(...)          -> console registry + agent-b /quote
  async pay(...)            -> console settlement endpoint: mandate
                               charge against the PRE-APPROVED
                               envelope (no passkey; this is what
                               makes autonomous simulation REAL),
                               report APPROVED, ledger append
  async verify_payment(...) -> console run/ledger lookup by
                               transactionId
  async refund(...)         -> documented not-supported error object
                               (honest failure handling; Prava has no
                               refund in our surface)
Failure-case test: a quote exceeding the arbiter cap maps the
NEEDS_HUMAN / REFUSE verdict into the layer's error shape.
The envelope is approved ONCE by a human before the simulation; the
scenario README states this explicitly. Never fake approval.
Branch name pattern from their prior hackathon: hackathon/<handle>-<theme>;
follow whatever CONTRIBUTING.md says today.

=====================================================================
5. GAPS: complete before writing code (Sunday, 10 minutes)
=====================================================================
[ ] THE EXACT Payments protocol method signatures: open
    packages/nest-plugins-reference/ in the repo and read the
    payments plugin (prepaid_credits). The pravahack page names
    quote/pay/verify/refund; the reference file is the contract.
      git clone https://github.com/projnanda/nandatown.git /tmp/nandatown
      ls /tmp/nandatown/packages/nest-plugins-reference/
[ ] CONTRIBUTING.md for the PR process:
      https://github.com/projnanda/nandatown/blob/main/CONTRIBUTING.md
[ ] Ask in the NANDA track channel ONLY if the reference file is
    ambiguous. Their rep is available Sunday.
