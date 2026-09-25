// Searchable index for the toolbar's command search. Each entry maps a
// human label (plus extra keywords) to the exact CollapsiblePanel `title`
// it should open — see InspectorPanel.tsx's `requestedPanel` effect, which
// already knows how to open/scroll to a panel by that title string (the
// same mechanism addText() uses to auto-open "Insert").

export interface PanelCommand {
  label: string;
  panel: string;
  keywords?: string[];
  /** This panel only renders with SOME item selected (any type — see e.g.
   * AlignPanel.tsx's `if (!selectedId) return null;`). */
  requiresSelection?: boolean;
  /** This panel only renders when the selection is specifically a photo (see
   * e.g. StylePanel.tsx's `if (!sel || sel.type !== 'image') return null;`).
   * Without one, opening it would do nothing — no matching panel is mounted. */
  requiresPhoto?: boolean;
}

export const PANEL_COMMANDS: PanelCommand[] = [
  {
    label: 'Canvas size',
    panel: 'Canvas',
    keywords: ['dimensions', 'resize canvas', 'print', 'square', 'portrait', 'story', 'landscape', 'wide'],
  },
  {
    label: 'Layout',
    panel: 'Layout',
    keywords: ['grid', 'justified', 'mosaic', 'margin', 'gutter', 'spacing', 'shuffle'],
  },
  {
    label: 'Insert text or sticker',
    panel: 'Insert',
    keywords: ['add text', 'sticker', 'emoji', 'font'],
  },
  {
    label: 'Photo alignment',
    panel: 'Photo Alignment',
    keywords: ['align left', 'align right', 'center', 'top', 'bottom'],
    requiresSelection: true,
  },
  {
    label: 'Crop and arrange',
    panel: 'Crop and Arrange',
    keywords: [
      'crop',
      'zoom',
      'resize photo',
      'rotate',
      'flip',
      'opacity',
      // Not 'replace photo' — that's a toolbar button, not in this panel.
      'bring to front',
      'send to back',
    ],
    requiresSelection: true,
  },
  {
    label: 'Enhance & adjust',
    panel: 'Enhance & Adjust',
    keywords: [
      'brightness',
      'contrast',
      'saturation',
      'blur',
      'warmth',
      'grayscale',
      'sepia',
      'brighten',
      'darken',
      'antique',
      'vivid',
      'auto enhance',
      'histogram',
    ],
    requiresPhoto: true,
  },
  {
    label: 'Photo border',
    panel: 'Photo Border',
    keywords: [
      'border color',
      'border width',
      'corner radius',
      'frame',
      'dashed',
      'dotted',
      'glyph',
      'clip shape',
      'circle',
      'heart',
      'oval',
    ],
    requiresPhoto: true,
  },
  {
    label: 'Collage background',
    panel: 'Collage Background',
    keywords: ['color', 'gradient', 'pattern', 'background image'],
  },
  {
    label: 'Collage frame',
    panel: 'Collage frame',
    keywords: ['canvas border', 'canvas corner radius'],
  },
  {
    label: 'Settings',
    panel: 'Settings',
    // Not 'auto save' — that toggle lives in the Projects dialog, which a
    // panel command can't open.
    keywords: ['snap', 'swap mode', 'lock aspect', 'stay in crop mode', 'lock layout'],
  },
  {
    label: 'Export settings',
    panel: 'Export settings',
    keywords: ['png', 'jpeg', 'export scale', 'file name', 'download'],
  },
];

/** Case-insensitive substring match against a command's label + keywords. */
export function searchPanelCommands(query: string): PanelCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PANEL_COMMANDS.filter(
    (cmd) => cmd.label.toLowerCase().includes(q) || cmd.keywords?.some((k) => k.toLowerCase().includes(q)),
  );
}
