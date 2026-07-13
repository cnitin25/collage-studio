import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';

const STICKERS = [
  '⭐', '❤️', '✨', '🎉', '🌟', '🔥', '😍', '😎',
  '🥳', '🌈', '☀️', '🌸', '🍩', '🎈', '👑', '💯',
  '📌', '✅', '➡️', '💬', '🦄', '🐱', '🌿', '🎂',
];

export default function InsertPanel() {
  const addText = useEditorStore((s) => s.addText);
  const addSticker = useEditorStore((s) => s.addSticker);

  return (
    <CollapsiblePanel title="Insert">
<button className="btn btn-accent full" onClick={addText} title="Add an editable text box to the canvas">
        Add text
      </button>

      <p className="subhead">Stickers</p>
      <div className="emoji-grid">
        {STICKERS.map((e) => (
          <button key={e} className="emoji-btn" onClick={() => addSticker(e)} title={`Add ${e} sticker`} aria-label={`Add ${e}`}>
            {e}
          </button>
        ))}
      </div>
    </CollapsiblePanel>
  );
}
