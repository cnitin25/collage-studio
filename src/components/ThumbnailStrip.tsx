import { useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import type { ImageItem } from '../types';
import { importPhotos } from '../utils/importPhotos';

interface Props {
  /**
   * Phones: stay on screen (with just the + tile) when the canvas has items
   * but no photos. The selection bar takes this slot while something is
   * selected, and a slot that comes and goes would shift the canvas under
   * the user's finger every time selection changes.
   */
  keepSlot?: boolean;
}

export default function ThumbnailStrip({ keepSlot = false }: Props) {
  const items = useEditorStore((s) => s.items);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const select = useEditorStore((s) => s.select);
  // Sources that failed to load: those photos show as missing, like on the canvas.
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());

  const photos = items.filter((it): it is ImageItem => it.type === 'image');
  if (photos.length === 0 && !(keepSlot && items.length > 0)) return null;

  const handleAddMore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = () => {
      if (input.files?.length) void importPhotos(Array.from(input.files));
    };
    input.click();
  };

  return (
    <div className="thumb-strip">
      {photos.map((ph) => (
        <button
          key={ph.id}
          className={`thumb-item ${selectedIds.includes(ph.id) ? 'is-active' : ''}`}
          onClick={() => select(ph.id)}
          title="Click to select"
        >
          {ph.src && !broken.has(ph.src) ? (
            <img
              src={ph.src}
              alt=""
              className="thumb-img"
              draggable={false}
              onError={() => setBroken((b) => new Set(b).add(ph.src))}
            />
          ) : (
            <span className="thumb-missing" role="img" aria-label="Photo missing">
              ?
            </span>
          )}
          {selectedIds.includes(ph.id) && <span className="thumb-sel-mark" />}
        </button>
      ))}
      <button className="thumb-add" onClick={handleAddMore} title="Add more photos">
        <span>＋</span>
      </button>
    </div>
  );
}
