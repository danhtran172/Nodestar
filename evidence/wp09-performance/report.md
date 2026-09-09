# QC performance verification

Run: `npm run build && npm run test:perf` (production server, Desktop Chrome).

Fixtures contain 100, 300, and 500 Nodes plus goals, shared PATH branches, RELATED and REFERENCE links, Seed Boxes, and image-backed Imagination objects. The benchmark exercises pan, wheel zoom, implicit branch drag, explicit multi-select drag, valid/invalid re-parenting, focus, and image-heavy navigation.

The initial trace showed all Cards re-rendering as the editor recreated action callbacks and full collision scans on each preview. The kept fixes make Card rendering depend on visual content rather than position/callback identity, use a spatial collision index, and prefilter edge-occlusion candidates spatially. Domain correctness remained 50/50 green after each change.

Final production measurements are in `metrics.json`, with the trace in `production-trace.zip`.

| Fixture | Normal pan p95 | Explicit multi-drag p95 | Image navigation p95 | Result |
| --- | ---: | ---: | ---: | --- |
| 100 nodes | 16.8 ms | 16.8 ms | 16.8 ms | 60 fps class |
| 300 nodes | 16.8 ms | 16.7 ms | 16.8 ms | 60 fps class |
| 500 nodes | 16.8 ms | 49.9 ms | 33.3 ms | No recurring long task |

The 300-node implicit branch-drag trace has one isolated 52 ms task; the 500-node explicit drag has one isolated 65 ms task. Neither recurs in the same interaction window. Production React profiling hooks are intentionally no-ops in React's production build, so commit duration is recorded as 0; frame, long-task, layout/style, object-render, and edge-render telemetry remain available.
