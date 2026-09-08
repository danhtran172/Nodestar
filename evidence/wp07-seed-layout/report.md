# WP7 deterministic Seed layout report

Domain checks cover 1, 10, 11, 20, 21, and 30 seeds at 240px and 480px widths. Every rotated axis-aligned bound stays inside the Seed Box layout, no pair overlaps, semantic order is unchanged, short-seed rotation remains within 5–15 degrees, and all output is deterministic.

Browser evidence includes the required count matrix, long text, narrow and wide boxes, Shuffle persistence across reload, move/drop reshuffle with Undo restoration, and reduced-motion behavior.

Browser result: 12 passed. Domain result after WP7: 49 passed.
