# Testing

## Reproduce automated checks

Use Node.js 22.13 or later:

```sh
npm ci
npm run scan
npm test
npm run build
```

The GitHub Actions workflow runs source scanning, tests and the production build.

## Coverage

- Structured diagnostic-output validation and authored guided-demo paths.
- Multilingual safety fixtures and rejected hazardous actions.
- Signed visitor identity and transactional quota SQL using PGlite.
- Browser history isolation using IndexedDB mocks.
- Live mode disabled without explicit opt-in or without a key; enabled requests use a stubbed provider in automated tests.
- Free-text submission while live is off, without model requests or session persistence.
- Config quota reads, unavailable/stale usage states and mode-indicator rendering.

## Recorded results

Checks executed on October 12, 2026:

| Check | Observed result |
| --- | --- |
| Automated suite | 23 tests passed; 0 failed |
| TypeScript and Vite build | Passed |
| Current source/configuration scan | No findings |
| Built frontend scan | 7 text files inspected; no findings |
| Production access | Site opened without login |
| Guided diagnosis | Laptop scenario continued after an external-display observation |
| Live endpoint smoke test | One Wi-Fi/VPN example returned HTTP 200 and schema-valid diagnostic output |

The live request was a smoke test, not a measurement of diagnostic accuracy, reliability, latency or cost. Source and bundle scans use heuristics and do not establish that all repository history is free of secrets.

Additional browser checks on the preceding preview covered disabled-live guidance, keyboard opening and Escape dismissal of the mode popover, and light/dark rendering. At the available 1363 × 936 viewport, the home screen had no document overflow.

## Verification limits

The following have not been established by these checks:

- Layout at exactly 1366 × 768 and 1920 × 1080, mobile devices, zoom or long attachment layouts.
- Full accessibility or WCAG conformance.
- Complete live-interface regression testing, including usage-counter refresh after a provider response.
- Production quota exhaustion, concurrency or load behavior.
- Manual history isolation between two independent browsers; storage mocks provide narrower coverage.
- Real-image diagnostic quality or resistance to prompt injection beyond the test fixtures.

Guided evidence is simulated. Live cause weights are estimates under a single-main-cause assumption, not measured probabilities. FixPilot is not a substitute for a qualified technician.
