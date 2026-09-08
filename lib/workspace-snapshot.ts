import type { VisionMap } from './graph';

export const workspaceSnapshotSchemaVersion = 1 as const;
export type WorkspaceSnapshot = {
  schemaVersion: typeof workspaceSnapshotSchemaVersion;
  revision: number;
  savedAt: number;
  map: VisionMap;
};
type MapValidator = (value: unknown) => VisionMap;

export function makeWorkspaceSnapshot(
  map: VisionMap,
  revision: number,
  savedAt = Date.now(),
): WorkspaceSnapshot {
  return {
    schemaVersion: workspaceSnapshotSchemaVersion,
    revision,
    savedAt,
    map,
  };
}

export function decodeWorkspaceSnapshot(
  value: unknown,
  validateMap: MapValidator,
): WorkspaceSnapshot | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value
  ) {
    const snapshot = value as Partial<WorkspaceSnapshot>;
    if (
      snapshot.schemaVersion !== workspaceSnapshotSchemaVersion ||
      !Number.isSafeInteger(snapshot.revision) ||
      (snapshot.revision ?? -1) < 0 ||
      !Number.isFinite(snapshot.savedAt)
    )
      throw new Error('This workspace snapshot is invalid.');
    return {
      schemaVersion: workspaceSnapshotSchemaVersion,
      revision: snapshot.revision!,
      savedAt: snapshot.savedAt!,
      map: validateMap(snapshot.map),
    };
  }
  return makeWorkspaceSnapshot(validateMap(value), 0, 0);
}

export function chooseWorkspaceSnapshot(
  local: WorkspaceSnapshot | null,
  database: WorkspaceSnapshot | null,
) {
  if (!local) return database;
  if (!database) return local;
  if (database.revision !== local.revision)
    return database.revision > local.revision ? database : local;
  return database.savedAt >= local.savedAt ? database : local;
}
