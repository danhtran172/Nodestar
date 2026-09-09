export type CanvasCommitSample = {
  actualDuration: number;
  baseDuration: number;
  commitTime: number;
};

export type SpreadPerformanceProbe = {
  objectRenders: number;
  edgeRenders: number;
  commits: CanvasCommitSample[];
};

declare global {
  interface Window {
    __spreadPerformanceProbe?: SpreadPerformanceProbe;
  }
}

function probe() {
  return typeof window === 'undefined'
    ? undefined
    : window.__spreadPerformanceProbe;
}

export function recordObjectRender() {
  const current = probe();
  if (current) current.objectRenders += 1;
}

export function recordEdgeRender() {
  const current = probe();
  if (current) current.edgeRenders += 1;
}

export function recordCanvasCommit(
  _id: string,
  _phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
  baseDuration: number,
  _startTime: number,
  commitTime: number,
) {
  const current = probe();
  if (current)
    current.commits.push({ actualDuration, baseDuration, commitTime });
}
