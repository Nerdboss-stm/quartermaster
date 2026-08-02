# docs/linq.md
# Compiled Jul 31, 2026 from docs.linqapp.com (fetched today).
# ACCESS IS GRANTED via the hackathon organizers. Keys in .env.
# THE AUTHORITATIVE COMPLETE REFERENCE: run the command in section 5
# to pull llms-full.txt locally. Everything here is the primer.

=====================================================================
1. BASICS
=====================================================================
Base URL:  https://api.linqapp.com/api/partner/v3   (V3; V2 is legacy)
Auth:      Authorization: Bearer YOUR_TOKEN   (provisioned token)
You need:  the bearer token, a phone number assigned to the account
           (the number the agent texts FROM), and a public https
           webhook endpoint for replies.
Handles:   phone numbers strictly E.164 (+12223334444), no spaces or
           dashes. Emails standard format.
SDKs:      official TypeScript and Python SDKs exist (typed, auto
           retries): https://docs.linqapp.com/getting-started/sdks/

=====================================================================
2. SEND A MESSAGE (the documented quick example)
=====================================================================
curl -X POST https://api.linqapp.com/api/partner/v3/chats \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+12223334444",
    "to": ["+15556667777"],
    "message": { "parts": [
      { "type": "text", "value": "Hello from Linq!" }
    ]}
  }'
Message parts types include text, media, link (link must be the only
part), and imessage_app (must be the only part; interactive cards;
OUT OF SCOPE for us, text + regex replies is the plan).
Threading, reactions, typing indicators, read receipts, and effects
exist; none are required for the escalation flow.

=====================================================================
3. RECEIVE REPLIES (webhooks)
=====================================================================
Real-time webhooks stream incoming messages, delivery, read
receipts, reactions. Our endpoint: POST {CONSOLE_URL}/api/webhooks/linq.
Signature verification scheme and the exact event payload shape
(message.received event) are specified in the webhook pages; they
are in llms-full.txt after you pull it (section 5). Until read, keep
the parser in packages/escalation/src/linq.ts behind VERIFY comments.
Guide URLs:
  https://docs.linqapp.com/guides/webhooks/
  https://docs.linqapp.com/guides/webhooks/subscriptions/
  https://docs.linqapp.com/guides/webhooks/events/

=====================================================================
4. LOCAL DEVELOPMENT GOLD: THE CLI WEBHOOK LISTENER
=====================================================================
Linq ships a Stripe-CLI-style forwarder:
  linq webhooks listen --forward-to http://localhost:3000/api/webhooks/linq
This forwards live events to the LOCAL console during build and
recording, which removes the deployed-webhook-to-local-db relay
problem entirely. Install the Linq CLI (linqapp.com/cli), log in with
the provisioned credentials, and use this during Saturday night and
the Sunday recording. The deployed webhook route stays as the
production path.

=====================================================================
5. COMPLETE THE REFERENCE LOCALLY (run these now)
=====================================================================
curl -s https://docs.linqapp.com/llms-full.txt > docs/linq-full.md
# concise index instead: curl -s https://docs.linqapp.com/llms.txt
Key pages if you prefer targeted reads:
  /getting-started/quickstart/   /getting-started/authentication/
  /guides/messaging/sending-messages/   /guides/messaging/message-details/
  /guides/webhooks/ (+ subscriptions, events)
  /guides/platform/rate-limits/   /error

=====================================================================
6. QUARTERMASTER MAPPING
=====================================================================
Escalation send (beat 7): POST /v3/chats from the assigned number to
DEMO phone, one text part:
  "QUARTERMASTER: blocked a $47.00 GPU purchase (policy cap $40.00).
   Reply APPROVE, DECLINE, or RAISE CAP TO $X."
Reply (beat 8): webhook -> signature verify -> strict regex parse
(APPROVE / DECLINE / RAISE CAP TO $47, case-insensitive) -> amendment.
Unrecognized reply -> send the correction message listing the three
exact forms. NO LLM in the reply parser.
Confirmations: after EXECUTE + settlement, send the receipt line:
  "Approved. Charged $47.00 to agent_b under mandate mnd_... .
   Envelope: $65.00 of $120.00 used."
GAPS TO FILL FROM linq-full.md OR THE GRANTED CREDS PAGE:
  [ ] exact webhook event name + payload JSON for an incoming text
  [ ] signature header name + verification algorithm
  [ ] the FROM number assigned to our account
  [ ] whether a webhook subscription must be created via API or is
      configured by the organizers
## CAPTURED WEBHOOK PAYLOAD (Aug 2, live capture, verified in code)
Event NAME FIELD: top-level `event_type` (NOT `event`).
  message.received (api_version v3, webhook_version 2026-02-03)
Reply text: data.parts[] where type=="text", value field (NOT data.body).
Filter: data.direction == "inbound", data.chat.id == LINQ_DEMO_CHAT_ID
  demo chat.id: 7ff6ddfc-9c4a-47ca-a173-b3f825bbf6a2
Sender: data.sender_handle.handle (is_me=false), owner +17132816664
Signing: Standard Webhooks (webhook-id/-timestamp/-signature headers,
  HMAC-SHA256, base64 key from whsec_, v1,<base64> compare) — VERIFIED.
LOCAL FORWARDING: `linq webhooks listen` creates a relay subscription
  with its OWN signing secret (session-only) -> console env
  LINQ_WEBHOOK_SECRET_CLI. Dashboard subscription secret stays in
  LINQ_WEBHOOK_SECRET (deployed path). The route accepts either.
Full event list available: message.sent/received/read/delivered/failed,
reaction.added/removed, participant.*, chat.*, typing indicators,
phone_number.status_updated
Subscription plan (I6b): message.received + message.delivered + message.failed
Note: CLI signing secret is session-only; real secret comes from the
dashboard subscription.
[paste the two raw event lines here]