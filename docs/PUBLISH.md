# Deployment

FixPilot runs on Netlify with Git-based deployment.

| Setting | Value |
| --- | --- |
| Repository | https://github.com/Mahmoud-vzh/Fixpilot |
| Production branch | `main` |
| Hosted application | https://fixpilot-ai.netlify.app/ |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Functions directory | `netlify/functions` |

Build and routing settings are defined in `netlify.toml`.

## Guided-only mode

Live mode is off by default. With `LIVE_AI_ENABLED` unset or not equal to `true`, guided demos run locally without a provider key.

## Live mode

Live requests require both `LIVE_AI_ENABLED=true` and a working `GEMINI_API_KEY`. Set runtime variables in Netlify's environment settings with Functions scope and the intended deploy context. Provider credentials must not use a `VITE_` prefix or appear in source control.

Apply `netlify/database/migrations/20261010090000_usage_limits.sql` to the quota database before enabling live mode. Diagnosis requests fail closed if the quota service is unavailable. Optional model and usage settings are listed in the [README](../README.md#local-setup).

### Recommended production values

The deployment owner reported free-tier `gemini-3.1-flash-lite` quotas of 500 RPD, 15 RPM and 250,000 TPM on 2026-10-14. Re-check Google AI Studio: Google may change these quotas. The provider reset time is unverified; only the application's UTC reset times are known.

Set these non-secret values manually in Netlify, with Functions scope and Production context:

```dotenv
LIVE_AI_ENABLED=true
GEMINI_MODEL=gemini-3.1-flash-lite
DAILY_AI_REQUEST_LIMIT=200
VISITOR_DAILY_LIMIT=10
```

Keep the existing `GEMINI_API_KEY` in Netlify's secret environment settings. Never place its value in documentation, a commit, a chat message or a frontend variable. No network/minute variable is required: those caps are fixed at 30/network/UTC hour and a conservative 10 site-wide reservations per rolling minute. `.env.example` intentionally retains empty values.

The call audit found `maxCalls = 1`: one streaming generation call, no automatic retries, repair requests, provider fallback or counting API call. A manual retry consumes a new reservation. Therefore the shared recommendation is `min(200, floor(300 / 1)) = 200`, without raising the existing hard maximum. Visitor 10 and network 30 cannot bypass this shared cap. Invalid values fall back to defaults; excessively large integer values clamp to 200 and 30 respectively.

The minute guard uses the current and previous UTC minute's transactional counters to stop bursts across boundaries. It can conservatively hold admission for almost two minutes after a full burst; the message supplies the next eligible UTC boundary. It uses the existing `usage_limits` table: no new database migration is needed.

The payload guard bounds all provider-bound text (including system instructions, schema, serialized state/history/new evidence) to 16,000 UTF-8 bytes, and pins image processing to `MEDIA_RESOLUTION_HIGH`. Planning estimate: `16,000 + 1,120 image + 6,000 output/thinking + 1,000 framing = 24,120` tokens/call; `10 × 24,120 = 241,200 < 250,000 TPM`. One token per UTF-8 byte and the media/framing budgets are conservative assumptions, **not measured usage**. Oversized payloads are rejected before consuming quota. See the [README token analysis](../README.md#token-planning-estimate-not-a-measurement).

A provider day may overlap two application UTC days: up to `2 × 200 = 400` app calls, assuming a 24-hour provider day. The nominal 300-call planning allowance is therefore not a guarantee of 60% usage in Google's quota day. Keep additional testing within the remaining headroom, avoid sharing this key/quota with uncounted deployments, and do not assume Google's reset matches UTC. Provider 429s remain possible. These are request caps, not a monetary budget or a promise of free operation.

The deployment-specific free-tier privacy wording is centralized in `src/lib/privacy.ts` and mirrored/tested in the README. Re-check Google's unpaid-service terms before relying on it or switching tiers.

Redeploy after runtime environment changes. Production, preview and local contexts have separate configuration; a preview does not update the production branch.

## Build checks

```sh
npm ci
npm run scan
npm test
npm run build
npm audit --omit=dev
```

GitHub Actions runs the automated checks. See [Testing](VERIFICATION.md) for coverage and recorded results, and [Security and privacy](SECURITY_REVIEW.md) for application controls and limitations.
