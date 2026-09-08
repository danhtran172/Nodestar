export type ImageRequestOrigin = 'paste' | 'drop' | 'picker';

export function shouldRejectImagePaste(
  fileTypes: readonly string[],
  selectionSize: number,
) {
  return (
    selectionSize > 1 && fileTypes.some((type) => type.startsWith('image/'))
  );
}
