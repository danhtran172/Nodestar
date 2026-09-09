# QC-008 scope-cleanup evidence

- Static guard: `tests/scope-cleanup.test.mjs` verifies the editor and README contain no WebMCP or `modelContext` integration.
- Runtime guard: `tests/e2e/scope-cleanup.spec.ts` injects a fake model-tool registry before application startup and verifies no tool is registered.
- Regression: the same browser test double-clicks the canvas and creates a normal Node, confirming that removing the experimental integration did not remove the user-facing creation flow.
- Recording: `scope-cleanup.webm`.

Run: `npm run test:e2e -- --project=chromium tests/e2e/scope-cleanup.spec.ts` — 1 passed.
