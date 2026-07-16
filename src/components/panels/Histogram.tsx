import { useEffect, useState } from 'react';
import { computeHistogram, histogramFromCanvas, type Histogram as HistogramData } from '../../utils/histogram';
import { getImageNode } from '../../utils/imageNodeRegistry';
import type { ImageItem } from '../../types';

const W = 240;
const H = 72;
const THUMB = 120; // downscale target for the offscreen render — only the value distribution matters

function toPath(values: number[], max: number) {
  const step = W / (values.length - 1);
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(H - (v / max) * H).toFixed(1)}`)
    .join(' ');
}

/**
 * Overlay of the selected photo's current R/G/B value distribution. Reads
 * pixels from the actual rendered Konva node (via imageNodeRegistry) so it
 * reflects live crop/filter edits, not just the original source file.
 */
export default function Histogram({ item }: { item: ImageItem }) {
  const [data, setData] = useState<HistogramData | null>(null);

  useEffect(() => {
    const node = getImageNode(item.id);
    if (node) {
      try {
        const aspect = item.height / item.width;
        const canvas = node.toCanvas({ width: THUMB, height: Math.max(1, Math.round(THUMB * aspect)) });
        setData(histogramFromCanvas(canvas));
        return;
      } catch {
        // Node exists but couldn't be rasterized — fall through to the
        // raw-source fallback below.
      }
    }
    // Node not mounted yet (e.g. first paint) — show the original file
    // until it registers; the next edit will pick up the live node.
    let cancelled = false;
    computeHistogram(item.src).then((h) => {
      if (!cancelled) setData(h);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.src, item.filters, item.crop, item.width, item.height]);

  return (
    <div className="histogram-wrap">
      <svg
        className="histogram"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
      >
        <rect x={0} y={0} width={W} height={H} fill="var(--panel-hi)" />
        {data && (
          <>
            <path d={toPath(data.r, data.max)} fill="none" stroke="#ff5a5a" strokeWidth={1.2} opacity={0.85} />
            <path d={toPath(data.g, data.max)} fill="none" stroke="#3ddc84" strokeWidth={1.2} opacity={0.85} />
            <path d={toPath(data.b, data.max)} fill="none" stroke="#5a9dff" strokeWidth={1.2} opacity={0.85} />
          </>
        )}
      </svg>
      {!data && <p className="dim small histogram-loading">Analyzing photo…</p>}
    </div>
  );
}
