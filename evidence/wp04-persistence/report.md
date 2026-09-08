# WP4 recovery failure-injection report

Environment: Playwright Chromium 153, Windows, local Vinext development server.

| Case | Expected source/status | Result |
| --- | --- | --- |
| Local revision 4, database revision 5 | Database / healthy | Pass |
| Local revision 6, database revision 5 | Local / healthy | Pass |
| Corrupt local, valid database | Database / healthy | Pass |
| Legacy raw local map | Migrated local / healthy | Pass |
| Map transaction failure, valid local | Local / degraded | Pass |
| Asset transaction failure, valid map | Database / degraded | Pass |
| No valid candidate | Demo map | Pass |
| Rapid revisions | Latest local and database revisions match | Pass |

Run: `npm run test:e2e -- --project=chromium tests/e2e/persistence.spec.ts`

Result: 8 passed.
