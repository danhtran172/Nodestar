import { readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
const root = 'dist/client';
async function list(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? list(join(directory, e.name))
        : [join(directory, e.name)],
    ),
  );
  return nested.flat();
}
const files = (await list(root)).filter((p) => /\.(js|css|woff2|png)$/.test(p));
await writeFile(
  join(root, 'offline-assets.json'),
  JSON.stringify(
    files.map((p) => '/' + relative(root, p).replaceAll('\\', '/')),
  ),
);
console.log(`Prepared ${files.length} assets for offline use.`);
