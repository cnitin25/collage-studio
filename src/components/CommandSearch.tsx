import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { searchPanelCommands, type PanelCommand } from '../style/commandIndex';

/** Inspector-panel command search — an always-visible field at the top of
 * the panel. Selecting a result opens the matching accordion section via
 * the store's requestedPanel mechanism (the same one addText() already
 * uses to auto-open "Insert"). */
export default function CommandSearch() {
  const requestPanel = useEditorStore((s) => s.requestPanel);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectedIsImage = useEditorStore(
    (s) => s.items.find((i) => i.id === s.selectedId)?.type === 'image',
  );

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = searchPanelCommands(query);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Closes the dropdown on outside click/tap, same pattern used elsewhere
  // in the toolbar for its overflow menu.
  useEffect(() => {
    if (!showResults) return;
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [showResults]);

  // A command's panel only actually mounts under these conditions (see e.g.
  // StylePanel.tsx's own `if (!sel || sel.type !== 'image') return null;`) —
  // without that, requestPanel() would silently do nothing.
  const isUnavailable = (cmd: PanelCommand) =>
    (cmd.requiresPhoto && !selectedIsImage) || (cmd.requiresSelection && !selectedId);

  const selectCommand = (cmd: PanelCommand) => {
    if (isUnavailable(cmd)) return;
    requestPanel(cmd.panel);
    setQuery('');
    setShowResults(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowResults(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = results[activeIndex];
      if (cmd) selectCommand(cmd);
    }
  };

  const open = showResults && results.length > 0;

  return (
    <div className="command-search" ref={wrapRef}>
      <input
        className="command-search-input"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowResults(true);
        }}
        onFocus={() => setShowResults(true)}
        onKeyDown={onKeyDown}
        placeholder="Search commands…"
        aria-label="Search commands"
        role="combobox"
        aria-expanded={open}
        aria-controls="command-search-listbox"
      />
      {open && (
        <div className="overflow-menu command-search-results" role="listbox" id="command-search-listbox">
          {results.map((cmd, i) => {
            const disabled = isUnavailable(cmd);
            return (
              <button
                key={cmd.label}
                className={`overflow-item ${i === activeIndex ? 'is-active' : ''}`}
                role="option"
                aria-selected={i === activeIndex}
                disabled={disabled}
                title={disabled ? (cmd.requiresPhoto ? 'Select a photo first' : 'Select something first') : undefined}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => selectCommand(cmd)}
              >
                {cmd.label}
                {disabled && (
                  <span className="dim" style={{ marginLeft: 6, fontWeight: 400 }}>
                    — {cmd.requiresPhoto ? 'select a photo' : 'select something'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
