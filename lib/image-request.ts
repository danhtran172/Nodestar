import type { VisionMap } from './graph';
export type ImageRequestOrigin = 'paste' | 'drop' | 'picker';

export function shouldRejectImagePaste(
  fileTypes: readonly string[],
  selectionSize: number,
) {
  return (
    selectionSize > 1 && fileTypes.some((type) => type.startsWith('image/'))
  );
}

export function quarantineMissingAssetReferences(
  map: VisionMap,
  availableAssetIds: ReadonlySet<string>,
) {
  const missing = new Set<string>();
  for (const object of map.objects)
    for (const id of object.images)
      if (!availableAssetIds.has(id)) missing.add(id);
  // An unavailable asset is a storage/read problem, never permission to
  // mutate the user's map. Keeping the reference lets a later IndexedDB read
  // recover the image and guarantees ordinary map edits cannot erase it.
  return {
    map,
    missing: [...missing],
  };
}
