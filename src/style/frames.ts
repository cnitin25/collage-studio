import type { ShadowStyle } from '../types';

export type FrameId = 'none' | 'hairline' | 'matte' | 'bold' | 'soft';

export interface FrameStyle {
  borderWidth: number;
  borderColor: string;
  cornerRadius: number;
  shadow?: ShadowStyle;
}

export const FRAMES: { id: FrameId; label: string; style: FrameStyle }[] = [
  { id: 'none', label: 'None', style: { borderWidth: 0, borderColor: '#ffffff', cornerRadius: 0 } },
  {
    id: 'hairline',
    label: 'Hairline',
    style: { borderWidth: 2, borderColor: 'rgba(0,0,0,0.55)', cornerRadius: 0 },
  },
  {
    id: 'matte',
    label: 'Matte',
    style: { borderWidth: 18, borderColor: '#ffffff', cornerRadius: 0 },
  },
  {
    id: 'bold',
    label: 'Bold',
    style: { borderWidth: 10, borderColor: '#15171d', cornerRadius: 0 },
  },
  {
    id: 'soft',
    label: 'Soft',
    style: {
      borderWidth: 0,
      borderColor: '#ffffff',
      cornerRadius: 18,
      shadow: { color: '#000000', blur: 26, opacity: 0.32, offsetX: 0, offsetY: 10 },
    },
  },
];
