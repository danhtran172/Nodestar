# WP6 predictive layout report

The browser run records three uninterrupted scenarios:

- Valid re-parent: preview equals committed coordinates, the layout attachment changes, other incoming PATH edges remain, and Undo restores the original edge.
- Invalid circular re-parent: invalid target/message appear and pointer-up commits nothing.
- Bounds collision without pointer hit: the moving branch is locally displaced to a collision-free preview and commit.

The domain suite additionally covers shared downstream, Goal movement, explicit multi-selection, deterministic output, and exact coordinate/identity preservation for unrelated objects.

Browser result: 3 passed. Domain result after WP6: 36 passed.
