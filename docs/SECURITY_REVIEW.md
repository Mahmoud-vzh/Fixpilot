# Security and privacy

## Application controls

- Gemini credentials are read only by Netlify Functions. Provider calls require `LIVE_AI_ENABLED` to equal `true` and a key to be present.
- The browser uses same-origin config and diagnosis endpoints. Requests have origin checks, bounded payload validation and image-signature checks.
- Model output is validated against the structured schema and checked for hazardous actions.
- PostgreSQL quota reservations use transactions and row locks. Stored quota data consists of pseudonymous bucket identifiers, counts and expiry timestamps.
- `netlify.toml` configures CSP, framing restrictions, `nosniff`, referrer policy and permissions policy. Functions set their own no-store and nosniff response headers.
- Environment files, dependency/build directories and local Netlify state are excluded through `.gitignore`. Source and frontend-bundle scanning run in CI.

## Data handling

History, diagnostic messages, uploaded images and report snapshots are stored in browser IndexedDB. Theme preference is stored in localStorage. There is no account system or cloud history synchronization.

Live mode sends diagnostic context, recent messages and an optional image through Netlify to Google Gemini. Application server code does not store or log message or image content. Provider processing and infrastructure request metadata remain subject to the relevant service terms.

A signed HttpOnly, SameSite cookie identifies a visitor for quotas. Daily HMAC-pseudonyms represent visitor and network buckets; the application does not store raw IP addresses. Expired quota rows are removed during subsequent reservations.

Session deletion and **Settings → Delete all my data** clear local history. They do not remove exported reports or reverse data already sent to a provider.

## Automated checks

```sh
npm ci
npm run scan
npm test
npm run build
```

The scanner checks current source/configuration and built frontend text for recognizable secrets and unwanted public artifacts. It does not traverse Git history or inspect provider dashboards, remote logs or binary metadata. Recorded test results and coverage limits are in [Testing](VERIFICATION.md).

## Limitations

Pattern scanning can miss encoded, obfuscated or unrecognized secrets. Request validation, prompt boundaries and deterministic safety checks reduce some risks but do not guarantee factual correctness or resistance to all prompt-injection attacks. Safety filters can miss hazards or reject benign inputs.

These controls are not a penetration test, dependency-vulnerability audit or security certification. Troubleshooting involving mains voltage, charged capacitors, damaged lithium batteries or moving machinery may require a qualified professional.
