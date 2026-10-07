# n8n-nodes-payload-flow by Payload

An n8n community node **by Payload** for [RevRule](https://github.com/Payloadhq/payload-flow): programmable revenue infrastructure. Define a Revenue Graph, send economic events from any n8n workflow, and get auditable entitlements back.

**The node never moves money.** It calls the Payload Rail API, which only *proposes* distributions (`status: "proposed"`). Execution stays with your payment provider (Stripe, an x402 facilitator, and so on). The royalty belongs to the Revenue Graph, not the payment rail.

## Install

In n8n: **Settings → Community Nodes → Install**, then enter `n8n-nodes-payload-flow`.

Or from GitHub (self-hosted n8n):

```bash
npm install Payloadhq/n8n-nodes-payload-flow
```

Restart n8n. The **RevRule** node appears in the node picker.

## Credentials

1. Get a free Rail API key (no signup form, no credit card):

```bash
curl -s -X POST https://payload-rail.fly.dev/v1/access-keys \
  -H 'Content-Type: application/json' -d '{"label":"n8n"}'
```

Copy the `key` from the response. It is shown once.

2. In n8n, create a **RevRule API** credential:
   - **Base URL**: keep `https://payload-rail.fly.dev` for the hosted Rail, or point it at your own self-hosted Rail.
   - **API Key**: paste the key.

## Operations

All operations target one **Revenue Graph** (resource: Revenue Graph).

| Operation | What it does |
|---|---|
| Create | Define a graph from a JSON spec (starts as `draft`). |
| Activate | Move a draft graph to `active` so it can evaluate events. |
| Get | Fetch a graph by ID. |
| Process Event | Evaluate one economic event and get entitlements, fees, proposed distributions, and ledger entries back. |
| Simulate Event | Dry-run an event with zero side effects. |
| Read Ledger | Read ledger entries for a graph, with hash-chain verification (`chainValid`). |

Amounts are integer micro-units (USD 1.00 = 1,000,000). `eventId` must be unique per graph; replays are idempotent.

Ready-made graph specs live in the [Revenue Blueprints](https://github.com/Payloadhq/payload-flow/tree/main/blueprints): API revenue share, marketplace split, creator recoupment.

## 5-minute tutorial: Stripe webhook → RevRule split

Split every Stripe sale between an operator and a contributor, automatically.

**One-time setup** (run once, e.g. with an n8n manual trigger):

1. Add a **RevRule** node → Operation **Create**. Paste a graph spec (see the [api-revenue-share blueprint](https://github.com/Payloadhq/payload-flow/blob/main/blueprints/api-revenue-share.json); replace `acct_OPERATOR` / `acct_CONTRIBUTOR` with your real Stripe account IDs). Execute it and note the graph `id`.
2. Add a **RevRule** node → Operation **Activate**, Graph ID = your graph id. Execute.

**The recurring workflow:**

1. **Webhook** node (or the **Stripe Trigger** node) listening for `checkout.session.completed`.
2. **RevRule** node → Operation **Process Event**, Graph ID = your graph id. In the Event JSON, map the Stripe payload:

```json
{
  "eventId": "={{ $json.id }}",
  "graphId": "g_api_revshare",
  "type": "SALE_COMPLETED",
  "occurredAt": "={{ new Date($json.created * 1000).toISOString() }}",
  "amountMicros": "={{ Math.round($json.amount_total / 100 * 1000000) }}",
  "currency": "USD",
  "rail": "stripe",
  "processingCostMicros": 0,
  "raw": {{ $json }}
}
```

3. The node returns `entitlements` (who is owed what, with reasons), `fees`, `distributions` (all `status: "proposed"`), and `ledgerEntries`. Feed the entitlements into your payout step (Stripe transfers, a payout queue, an accounting sheet). RevRule remembers recoupment balances across events, so repeat sales keep splitting correctly with no extra logic.

Tip: use **Simulate Event** first with a test payload to preview the split before processing real webhooks.

## Development

```bash
npm install
npm test        # vitest
npm run build   # n8n-node build
npm run lint    # n8n-node lint
```

## Links

- Payload Rail quickstart: https://payloadhq.github.io/flow-rail.html
- RevRule engine (MIT): https://github.com/Payloadhq/payload-flow
- Revenue Blueprints: https://github.com/Payloadhq/payload-flow/tree/main/blueprints
- Browser sandbox (no key needed): https://payloadhq.github.io/flow-sandbox.html
- Telegram: https://t.me/payloadtool
- Patreon: https://patreon.com/PayloadTools

## License

MIT
