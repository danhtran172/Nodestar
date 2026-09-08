# WP5 asset/reference integrity report

Environment: Playwright Chromium 153, Windows, local Vinext development server.

| Failure point | Expected invariant | Result |
| --- | --- | --- |
| File read | No asset/reference/history; no Retry | Pass |
| Image decode | No asset/reference/history; no Retry | Pass |
| Thumbnail generation | No canonical reference | Pass |
| Asset/map transaction | Pending error with Retry/Remove; no canonical reference | Pass |
| Map write | Whole transaction aborts | Pass |
| Quota exceeded | Existing reference remains; pending payload retained | Pass |
| Legacy orphan | Reference quarantined; no broken image or false Retry | Pass |
| Partial batch | Successful Imagination image retained; failure isolated | Pass |
| Retry then reload | Exactly one durable reference survives reload | Pass |
| Remove failed preview | Canonical map remains byte-for-byte unchanged | Pass |

Run: `npm run test:e2e -- --project=chromium tests/e2e/asset-integrity.spec.ts`

Result: 10 passed.
