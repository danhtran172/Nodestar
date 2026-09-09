import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('V1 source and README contain no WebMCP registration path', async () => {
  const [editor, readme] = await Promise.all([
    readFile(new URL('../components/spread-editor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
  ]);
  for (const forbidden of [
    'modelContext',
    'read_vision_map',
    'create_vision_node',
    'flushSync',
  ])
    assert.equal(editor.includes(forbidden), false, forbidden);
  assert.equal(readme.includes('WebMCP'), false);
});
