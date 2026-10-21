import { useEffect, useRef, useState } from 'react';
import { useEditorStore, fileNameForProject } from '../../store/useEditorStore';
import type { CanvasPreset } from '../../types';
import { AccordionContext } from './AccordionContext';
import LayoutPanel from './LayoutPanel';
import CropArrangePanel from './CropArrangePanel';
import EnhancePresetsPanel from './EnhancePresetsPanel';
import StylePanel from './StylePanel';
import InsertPanel from './InsertPanel';
import BackgroundPanel from './BackgroundPanel';
import AlignPanel from './AlignPanel';
import HistoryPanel from './HistoryPanel';
import CustomSizeFields from './CustomSizeFields';
import FramePanel from './FramePanel';
import CollapsiblePanel from './CollapsiblePanel';
import CommandSearch from '../CommandSearch';
import { maxExportScale } from '../../utils/exportStage';
import { BOTTOM_SHEET_QUERY, COMPACT_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import Icon, { type IconName } from '../ui/Icon';
import ModeToggles from '../ModeToggles';
import ScrollRail from '../ui/ScrollRail';

const PRESETS: CanvasPreset[] = [
  { label: 'Square', width: 1080, height: 1080 },
  { label: 'Portrait', width: 1080, height: 1350 },
  { label: 'Story', width: 1080, height: 1920 },
  { label: 'Landscape', width: 1350, height: 1080 },
  { label: 'Wide', width: 1920, height: 1080 },
];

// 300 DPI — standard photo-print resolution, so exports come out sharp at size.
const PRINT_PRESETS: CanvasPreset[] = [
  { label: '4×6"', width: 1200, height: 1800 },
  { label: '5×7"', width: 1500, height: 2100 },
  { label: '8×10"', width: 2400, height: 3000 },
  { label: 'A4', width: 2480, height: 3508 },
];

/**
 * A preset's proportions, fitted into a fixed 28 px box. The box is the same
 * size for every preset, so labels line up across a row; the shape inside is
 * sized from the real width/height, so Portrait and Story (or 4×6 and A4)
 * actually look different.
 */
function PresetShape({ width, height }: { width: number; height: number }) {
  const BOX = 28;
  const k = BOX / Math.max(width, height);
  return (
    <span className="preset-icon" aria-hidden>
      <span className="preset-shape" style={{ width: Math.round(width * k), height: Math.round(height * k) }} />
    </span>
  );
}

/**
 * Phone navigation: the left rail's groups, each a set of panel titles shown
 * together in the scrolling pane on the right. Seven rather than one per
 * panel so the rail fits the half-height sheet without scrolling itself.
 * Every panel title must be in exactly one group, or it's unreachable on a
 * phone — panels.spec.ts checks this against the desktop panel list.
 */
const NAV_GROUPS: { id: string; label: string; icon: IconName; titles: readonly string[]; needsSelection?: boolean }[] = [
  { id: 'canvas', label: 'Canvas', icon: 'ratio', titles: ['Canvas'] },
  { id: 'layout', label: 'Layout', icon: 'grid', titles: ['Layout'] },
  { id: 'insert', label: 'Insert', icon: 'text', titles: ['Insert'] },
  {
    id: 'photo',
    label: 'Photo',
    icon: 'adjust',
    titles: ['Photo Alignment', 'Crop and Arrange', 'Enhance & Adjust', 'Photo Border'],
    needsSelection: true,
  },
  { id: 'background', label: 'Background', icon: 'image', titles: ['Collage Background', 'Collage frame'] },
  { id: 'export', label: 'Export', icon: 'download', titles: ['Export settings'] },
  { id: 'history', label: 'History', icon: 'history', titles: ['History'] },
];
const groupOf = (title: string) => NAV_GROUPS.find((g) => g.titles.includes(title)) ?? NAV_GROUPS[0];

interface Props {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  /** Bottom-sheet height on phones: half (canvas stays visible) or nearly full. */
  expanded?: boolean;
  onSetExpanded?: (expanded: boolean) => void;
}

export default function InspectorPanel({ open: drawerOpen, onClose, collapsed, expanded = false, onSetExpanded }: Props) {
  const asideRef = useRef<HTMLElement>(null);
  // Phones only: the search field is hidden behind a header button, since a
  // permanent one cost the half-height sheet a fifth of its room. Desktop
  // always shows it (CSS).
  const [searchOpen, setSearchOpen] = useState(false);
  const drag = useRef<{ y: number } | null>(null);

  // The sheet follows a downward drag of its header; on release it closes or
  // shrinks past a threshold, an upward flick expands it, and a tap toggles.
  const onHeadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (!window.matchMedia(BOTTOM_SHEET_QUERY).matches) return;
    drag.current = { y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    asideRef.current?.classList.add('is-dragging');
  };
  const onHeadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const aside = asideRef.current;
    if (!drag.current || !aside) return;
    const dy = e.clientY - drag.current.y;
    aside.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  };
  const onHeadPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    const aside = asideRef.current;
    if (aside) {
      aside.style.transform = '';
      aside.classList.remove('is-dragging');
    }
    const dy = e.clientY - start.y;
    if (dy > 80) {
      if (expanded) onSetExpanded?.(false);
      else onClose?.();
    } else if (dy < -40) {
      onSetExpanded?.(true);
    } else if (Math.abs(dy) < 6) {
      onSetExpanded?.(!expanded);
    }
  };

  const canvas = useEditorStore((s) => s.canvas);
  const setCanvasSize = useEditorStore((s) => s.setCanvasSize);
  const requestedPanel = useEditorStore((s) => s.requestedPanel);
  const requestedAnchor = useEditorStore((s) => s.requestedAnchor);
  const clearRequestedPanel = useEditorStore((s) => s.clearRequestedPanel);
  const exportScale = useEditorStore((s) => s.exportScale);
  const setExportScale = useEditorStore((s) => s.setExportScale);
  const exportFileName = useEditorStore((s) => s.exportFileName);
  const setExportFileName = useEditorStore((s) => s.setExportFileName);
  const projectName = useEditorStore((s) => s.projectName);
  const exportFormat = useEditorStore((s) => s.exportFormat);
  const setExportFormat = useEditorStore((s) => s.setExportFormat);
  const resetView = useEditorStore((s) => s.resetView);
  const hasSelection = useEditorStore((s) => s.selectedId !== null);

  const [openId, setOpenId] = useState<string | null>('Canvas');
  // Phones: rail navigation instead of the accordion. Its own state, so
  // switching layout (rotating a tablet) doesn't fight the desktop accordion.
  const railNav = useMediaQuery(COMPACT_QUERY);
  const [navGroupId, setNavGroupId] = useState(NAV_GROUPS[0].id);
  const navGroup = NAV_GROUPS.find((g) => g.id === navGroupId) ?? NAV_GROUPS[0];
  const paneRef = useRef<HTMLDivElement>(null);
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // A new object per request, so asking for the section that's already open
  // still scrolls to it.
  const [scrollRequest, setScrollRequest] = useState<{ title: string; anchor: string | null } | null>(null);
  useEffect(() => {
    if (requestedPanel) {
      setScrollRequest({ title: requestedPanel, anchor: requestedAnchor });
      setOpenId(requestedPanel);
      setNavGroupId(groupOf(requestedPanel).id);
      clearRequestedPanel();
    }
  }, [requestedPanel, requestedAnchor, clearRequestedPanel]);

  // Runs after the commit that opened the requested section (and collapsed the
  // one above it), so the position is measured against the settled layout;
  // a frame scheduled from the request itself could run before that commit
  // and overshoot by the collapsed section's height.
  useEffect(() => {
    // The scroller is the right-hand pane with rail navigation, otherwise
    // the inspector itself.
    const scroller = railNav ? paneRef.current : asideRef.current;
    if (!scrollRequest || !scroller) return;
    const panel = scroller.querySelector<HTMLElement>(`[data-panel-title="${scrollRequest.title}"]`);
    // A spot inside the panel when one was asked for (e.g. its Crop controls).
    const section =
      (scrollRequest.anchor &&
        panel?.querySelector<HTMLElement>(`[data-panel-anchor="${scrollRequest.anchor}"]`)) ||
      panel;
    if (!section) return;
    // Scrolls the container itself rather than calling scrollIntoView, which
    // also scrolls every ancestor — including the page, even with overflow
    // hidden — and on a phone shifted the whole editor off-screen. Offset by
    // the sticky top block on desktop; the pane has nothing sticky above it.
    const head = railNav ? 0 : scroller.querySelector<HTMLElement>('.inspector-top')?.offsetHeight ?? 0;
    const top =
      scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - head;
    scroller.scrollTo({ top, behavior: 'smooth' });
  }, [scrollRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickNavGroup = (id: string) => {
    setNavGroupId(id);
    // A new section starts at its top, not wherever the last one was scrolled.
    paneRef.current?.scrollTo({ top: 0 });
  };

  const maxScale = maxExportScale(canvas.width, canvas.height);
  const effectiveScale = Math.min(exportScale, maxScale);

  const activePreset = PRESETS.find((p) => p.width === canvas.width && p.height === canvas.height);
  const orientedPrintPresets =
    printOrientation === 'landscape'
      ? PRINT_PRESETS.map((p) => ({ label: p.label, width: p.height, height: p.width }))
      : PRINT_PRESETS;
  const activePrintPreset = orientedPrintPresets.find(
    (p) => p.width === canvas.width && p.height === canvas.height,
  );

  return (
    <aside
      ref={asideRef}
      className={`inspector ${drawerOpen ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''} ${expanded ? 'is-expanded' : ''}`}
      aria-label="Tools"
    >
    {/* Sticky: the search (and, on a phone, the sheet header) stays in reach
        however far the panels are scrolled. */}
    <div className={`inspector-top ${searchOpen ? 'is-searching' : ''}`}>
    <div
      className="inspector-drawer-head"
      onPointerDown={onHeadPointerDown}
      onPointerMove={onHeadPointerMove}
      onPointerUp={onHeadPointerUp}
      onPointerCancel={onHeadPointerUp}
    >
      <span className="sheet-grabber" aria-hidden />
      <span className="inspector-drawer-title">Tools</span>
      <button
        className={`btn btn-ghost sheet-search ${searchOpen ? 'is-active' : ''}`}
        onClick={() => setSearchOpen((v) => !v)}
        aria-label={searchOpen ? 'Hide search' : 'Search commands'}
        aria-expanded={searchOpen}
        title={searchOpen ? 'Hide search' : 'Search commands'}
      >
        <Icon name="search" />
      </button>
      <button
        className="btn btn-ghost sheet-expand"
        onClick={() => onSetExpanded?.(!expanded)}
        aria-label={expanded ? 'Shrink tools' : 'Expand tools'}
        title={expanded ? 'Shrink tools' : 'Expand tools'}
      >
        <Icon name={expanded ? 'collapse' : 'expand'} />
      </button>
      <button className="btn btn-ghost inspector-close" onClick={onClose} aria-label="Close tools" title="Close tools">
        <Icon name="close" />
      </button>
    </div>
    <CommandSearch autoFocus={searchOpen} onDone={() => setSearchOpen(false)} />
    </div>
    {/* Phones: rail on the left, the picked group's panels scrolling on the
        right. Desktop: both wrappers are display: contents, so the panels
        are laid out exactly as before. */}
    <div className="inspector-body">
    <nav className="inspector-nav" aria-label="Tool sections">
      {NAV_GROUPS.map((g) => (
        <button
          key={g.id}
          className={`nav-item ${g.id === navGroup.id ? 'is-active' : ''} ${
            g.needsSelection && !hasSelection ? 'is-unavailable' : ''
          }`}
          aria-current={g.id === navGroup.id ? 'page' : undefined}
          onClick={() => pickNavGroup(g.id)}
        >
          <Icon name={g.icon} size={18} />
          <span>{g.label}</span>
        </button>
      ))}
    </nav>
    <div className="inspector-pane" ref={paneRef}>
    {railNav && navGroup.needsSelection && !hasSelection && (
      <p className="nav-empty">
        Select a photo on the canvas to align, crop, enhance or frame it. Text and stickers can be
        aligned and arranged here too.
      </p>
    )}
    <AccordionContext.Provider value={{ openId, setOpenId, navTitles: railNav ? navGroup.titles : null }}>
      <CollapsiblePanel title="Canvas">
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`preset ${activePreset?.label === p.label ? 'is-active' : ''}`}
              onClick={() => setCanvasSize(p.width, p.height)}
              title={`${p.label} — ${p.width} × ${p.height} px`}
            >
              <PresetShape width={p.width} height={p.height} />
              <span className="preset-label">{p.label}</span>
            </button>
          ))}
        </div>

        {/* Own row: beside the label there isn't room for both chips in the
            panel's width, and "Landscape" ran past its edge. */}
        <p className="subhead">Print (300 DPI)</p>
        <div className="chip-row print-orientation">
            {(['portrait', 'landscape'] as const).map((o) => (
              <button
                key={o}
                className={`chip ${printOrientation === o ? 'is-active' : ''}`}
                onClick={() => setPrintOrientation(o)}
                title={`${o[0].toUpperCase()}${o.slice(1)} orientation for print sizes`}
              >
                {o[0].toUpperCase()}{o.slice(1)}
              </button>
            ))}
        </div>
        <div className="preset-grid">
          {orientedPrintPresets.map((p) => (
            <button
              key={p.label}
              className={`preset ${activePrintPreset?.label === p.label ? 'is-active' : ''}`}
              onClick={() => setCanvasSize(p.width, p.height)}
              title={`${p.label} — ${p.width} × ${p.height} px at 300 DPI`}
            >
              <PresetShape width={p.width} height={p.height} />
              <span className="preset-label">{p.label}</span>
            </button>
          ))}
        </div>

        <p className="dim small">{canvas.width} × {canvas.height} px</p>
        <CustomSizeFields width={canvas.width} height={canvas.height} onApply={setCanvasSize} />
        <button
          className="btn btn-ghost full"
          style={{ marginTop: 10 }}
          onClick={resetView}
          title="Reset the canvas view to fit the window"
        >
          Reset zoom / pan
        </button>
      </CollapsiblePanel>

      <LayoutPanel />

      <InsertPanel />

      <AlignPanel />
      <CropArrangePanel />

      <EnhancePresetsPanel />
      <StylePanel />

      <BackgroundPanel />

      <FramePanel />


      <CollapsiblePanel title="Export settings">
        <input
          className="text-input"
          style={{ minHeight: 0, marginBottom: 10 }}
          value={exportFileName}
          spellCheck={false}
          onChange={(e) => setExportFileName(e.target.value)}
          aria-label="Export file name"
          placeholder={fileNameForProject(projectName)}
        />
        <div className="chip-row" style={{ marginBottom: 10 }}>
          {(['png', 'jpeg'] as const).map((f) => (
            <button
              key={f}
              className={`chip ${exportFormat === f ? 'is-active' : ''}`}
              onClick={() => setExportFormat(f)}
              title={f === 'png' ? 'PNG — lossless, larger file' : 'JPEG — smaller file, slight quality loss'}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className={`chip ${exportScale === n ? 'is-active' : ''}`}
              onClick={() => setExportScale(n)}
              disabled={n > 1 && n > maxScale}
              title={`Export at ${n}× the canvas resolution (${canvas.width * n} × ${canvas.height * n} px)`}
            >
              {n}×
            </button>
          ))}
        </div>
        <p className="dim small">
          {Math.round(canvas.width * effectiveScale)} × {Math.round(canvas.height * effectiveScale)} px ·{' '}
          {exportFileName.trim() || fileNameForProject(projectName)}.{exportFormat === 'jpeg' ? 'jpg' : 'png'}
        </p>
        {maxScale < 3 && (
          <p className="dim small">
            This browser can't make images larger than {maxScale}× at this canvas size
            {effectiveScale < exportScale ? ', so exports are made at that size' : ''}.
          </p>
        )}
      </CollapsiblePanel>

      <HistoryPanel />
    </AccordionContext.Provider>
    </div>
    {railNav && <ScrollRail target={paneRef} />}
    </div>
    {/* Phones only (CSS): the status bar that carries these on desktop is hidden. */}
    <div className="inspector-modes">
      <ModeToggles stacked />
    </div>
    </aside>
  );
}
