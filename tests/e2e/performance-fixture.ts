import type { Asset } from '../../lib/storage';
import type { CanvasObject, Relationship, VisionMap } from '../../lib/graph';

const preview =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="60"%3E%3Crect width="80" height="60" fill="%23825f4f"/%3E%3Ccircle cx="40" cy="30" r="18" fill="%23f4ddb7"/%3E%3C/svg%3E';

const node = (index: number): CanvasObject => ({
  id: `node-${index}`,
  type: 'NODE',
  role: index % 100 === 0 ? 'GOAL' : 'NORMAL',
  text: `Performance node ${index}`,
  note: '',
  x: 160 + (index % 25) * 265,
  y: 180 + Math.floor(index / 25) * 150,
  width: index % 100 === 0 ? 280 : 210,
  height: 90,
  images: index % 20 === 0 ? ['perf-image'] : [],
  seeds: [],
  tier: 10,
  shuffle: 0.25,
  focal: 50,
  createdAt: 1,
  updatedAt: 1,
});

export function performanceFixture(nodeCount: number): {
  map: VisionMap;
  assets: Asset[];
} {
  const objects = Array.from({ length: nodeCount }, (_, index) => node(index));
  const relationships: Relationship[] = [];
  for (let index = 0; index < nodeCount - 1; index += 1) {
    relationships.push({
      id: `path-${index}`,
      sourceId: `node-${index}`,
      targetId: `node-${index + 1}`,
      type: 'PATH',
    });
  }
  for (let index = 0; index + 10 < nodeCount; index += 10) {
    relationships.push({
      id: `shared-${index}`,
      sourceId: `node-${index}`,
      targetId: `node-${index + 10}`,
      type: 'PATH',
    });
  }
  const seedCount = Math.max(1, Math.floor(nodeCount / 100));
  for (let index = 0; index < seedCount; index += 1) {
    const id = `seed-box-${index}`;
    objects.push({
      id,
      type: 'SEED_BOX',
      role: 'NORMAL',
      text: `Seed Box ${index}`,
      note: '',
      x: 180 + index * 360,
      y: 1120,
      width: 310,
      height: 240,
      images: [],
      seeds: Array.from({ length: 10 }, (_, seed) => ({
        id: `${id}-seed-${seed}`,
        text: `Seed ${seed}`,
        visualSeed: seed + index * 10,
      })),
      tier: 10,
      shuffle: 0.2 + index / 10,
      focal: 50,
      createdAt: 1,
      updatedAt: 1,
    });
    const imaginationId = `imagination-${index}`;
    objects.push({
      id: imaginationId,
      type: 'IMAGINATION',
      role: 'NORMAL',
      text: `Image collection ${index}`,
      note: '',
      x: 540 + index * 360,
      y: 1120,
      width: 310,
      height: 240,
      images: ['perf-image'],
      seeds: [],
      tier: 10,
      shuffle: 0.3 + index / 10,
      focal: 50,
      createdAt: 1,
      updatedAt: 1,
    });
    relationships.push(
      {
        id: `related-${index}`,
        sourceId: `node-${index * 10}`,
        targetId: id,
        type: 'RELATED',
      },
      {
        id: `reference-${index}`,
        sourceId: `node-${index * 10 + 1}`,
        targetId: imaginationId,
        type: 'REFERENCE',
      },
    );
  }
  return {
    map: {
      version: 1,
      title: `Performance fixture ${nodeCount}`,
      anchorId: 'node-0',
      objects,
      relationships,
    },
    assets: [
      {
        id: 'perf-image',
        filename: 'performance.svg',
        mimeType: 'image/svg+xml',
        width: 80,
        height: 60,
        preview,
        full: preview,
        status: 'saved',
      },
    ],
  };
}
