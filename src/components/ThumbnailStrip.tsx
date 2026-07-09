import { useEditorStore } from '../store/useEditorStore';
import type { ImageItem } from '../types';
import { loadImageFiles } from '../utils/loadImage';

export default function ThumbnailStrip() {
  const items = useEditorStore((s) => s.items);
  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  const addImages = useEditorStore((s) => s.addImages);
  const setImportFailures = useEditorStore((s) => s.setImportFailures);

  const photos = items.filter((it): it is ImageItem => it.type === 'image');
  if (photos.length === 0) return null;

  const handleAddMore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*';
    input.onchange = async () => {
      if (!input.files?.length) return;
      const { images, failures } = await loadImageFiles(Array.from(input.files!));
      if (images.length) addImages(images);
      setImportFailures(failures);
    };
    input.click();
  };

  return (
    <div className="thumb-strip">
      {photos.map((ph) => (
        <button
          key={ph.id}
          className={`thumb-item ${selectedId === ph.id ? 'is-active' : ''}`}
          onClick={() => select(ph.id)}
          title="Click to select"
        >
          <img src={ph.src} alt="" className="thumb-img" draggable={false} />
          {selectedId === ph.id && <span className="thumb-sel-mark" />}
        </button>
      ))}
      <button className="thumb-add" onClick={handleAddMore} title="Add more photos">
        <span>＋</span>
      </button>
    </div>
  );
}
