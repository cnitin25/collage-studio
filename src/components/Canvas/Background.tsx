import { useEffect, useMemo, useRef } from 'react';
import { Rect, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import type { CanvasConfig } from '../../types';
import { coverCrop } from '../../utils/cover';
import { makePatternCanvas } from '../../utils/patterns';

export default function Background({ canvas }: { canvas: CanvasConfig }) {
  const { width: w, height: h } = canvas;
  const type = canvas.backgroundType;

  const grad = useMemo(() => {
    const rad = ((canvas.gradientAngle ?? 45) * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const cx = w / 2;
    const cy = h / 2;
    const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
    return {
      start: { x: cx - dx * half, y: cy - dy * half },
      end: { x: cx + dx * half, y: cy + dy * half },
    };
  }, [canvas.gradientAngle, w, h]);

  const patternCanvas = useMemo(() => {
    if (type !== 'pattern') return null;
    return makePatternCanvas(
      canvas.patternKind ?? 'dots',
      canvas.patternColor ?? '#000000',
      canvas.patternBg ?? '#ffffff',
      canvas.patternScale ?? 28,
    );
  }, [type, canvas.patternKind, canvas.patternColor, canvas.patternBg, canvas.patternScale]);

  const [bgImage] = useImage(type === 'image' ? canvas.backgroundImageSrc ?? '' : '');
  const imgRef = useRef<Konva.Image>(null);
  const blur = canvas.backgroundBlur ?? 0;

  useEffect(() => {
    const node = imgRef.current;
    if (!node || !bgImage) return;
    if (type === 'image' && blur > 0) node.cache();
    else node.clearCache();
    node.getLayer()?.batchDraw();
  }, [bgImage, blur, type, w, h]);

  if (type === 'gradient') {
    return (
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        fillLinearGradientStartPoint={grad.start}
        fillLinearGradientEndPoint={grad.end}
        fillLinearGradientColorStops={[0, canvas.gradientFrom ?? '#ffffff', 1, canvas.gradientTo ?? '#000000']}
        listening={false}
      />
    );
  }

  if (type === 'pattern' && patternCanvas) {
    return (
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        fillPatternImage={patternCanvas as unknown as HTMLImageElement}
        fillPatternRepeat="repeat"
        listening={false}
      />
    );
  }

  if (type === 'image' && canvas.backgroundImageSrc && bgImage) {
    const crop = coverCrop(bgImage.naturalWidth, bgImage.naturalHeight, w, h);
    return (
      <KonvaImage
        ref={imgRef}
        image={bgImage}
        x={0}
        y={0}
        width={w}
        height={h}
        crop={crop}
        filters={blur > 0 ? [Konva.Filters.Blur] : []}
        blurRadius={blur}
        listening={false}
      />
    );
  }

  return <Rect x={0} y={0} width={w} height={h} fill={canvas.backgroundColor} listening={false} />;
}
