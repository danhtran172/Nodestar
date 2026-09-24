import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NodestarCanvas } from '@/components/nodestar-canvas';
import type { VisionMap } from '@/lib/graph';

// Mounted only by Playwright, over an isolated browser context. No application route.
export function mountRelationHarness(initial: VisionMap) {
  const host = document.createElement('div');
  host.id = 'relation-harness';
  host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:white';
  document.body.appendChild(host);
  const root = createRoot(host);
  const calls = {
    select: 0,
    commit: 0,
    branch: 0,
    edit: 0,
    open: 0,
    create: 0,
  };
  let replace = (_map: VisionMap) => {};
  const noop = () => {};
  function Harness() {
    const [map, setMap] = useState(initial);
    useEffect(() => {
      replace = setMap;
    }, []);
    return (
      <NodestarCanvas
        map={map}
        assets={{}}
        selected={new Set()}
        explicit={false}
        edge=""
        focus=""
        viewport={{ x: 80, y: 130, zoom: 1 }}
        setViewport={noop}
        mode="select"
        layoutMode="canvas"
        onConvert={noop}
        linkedTitles={{}}
        onOpenGraph={noop}
        onFold={noop}
        connecting=""
        editing=""
        onText={noop}
        onDraft={noop}
        onSelect={() => calls.select++}
        onEdge={noop}
        onCommit={(next) => {
          calls.commit++;
          setMap(next);
        }}
        onBranch={() => calls.branch++}
        onEdit={() => calls.edit++}
        onCreate={() => calls.create++}
        onOpen={() => calls.open++}
        onStartConnection={() => calls.open++}
        onSeed={noop}
        onError={noop}
        onFiles={noop}
      />
    );
  }
  root.render(<Harness />);
  return {
    calls,
    replace: (map: VisionMap) => replace(map),
    unmount: () => {
      root.unmount();
      host.remove();
    },
  };
}
