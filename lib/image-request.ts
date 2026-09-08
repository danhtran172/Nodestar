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
  let changed = false;
  const objects = map.objects.map((object) => {
    const images = object.images.filter((id) => {
      const available = availableAssetIds.has(id);
      if (!available) missing.add(id);
      return available;
    });
    if (images.length === object.images.length) return object;
    changed = true;
    return { ...object, images };
  });
  return {
    map: changed ? { ...map, objects } : map,
    missing: [...missing],
  };
}
