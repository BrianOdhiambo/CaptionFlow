export const CAPTION_FONT_FAMILIES = [
  'app-default',
  'system-sans',
  'system-serif',
  'monospace',
] as const;
export type CaptionFontFamily = (typeof CAPTION_FONT_FAMILIES)[number];

export const CAPTION_FONT_WEIGHTS = [300, 400, 500, 600, 700] as const;
export type CaptionFontWeight = (typeof CAPTION_FONT_WEIGHTS)[number];

export const CAPTION_CONTRAST_MODES = ['normal', 'high', 'inverted', 'custom'] as const;
export type CaptionContrastMode = (typeof CAPTION_CONTRAST_MODES)[number];

export const CAPTION_POSITIONS = ['top', 'center', 'bottom'] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];

export const CAPTION_TEXT_OUTLINES = ['none', 'outline', 'shadow'] as const;
export type CaptionTextOutline = (typeof CAPTION_TEXT_OUTLINES)[number];

export interface CaptionAppearance {
  readonly fontFamily: CaptionFontFamily;
  readonly fontSize: number;
  readonly fontWeight: CaptionFontWeight;
  readonly fontColor: string;
  readonly backgroundColor: string;
  readonly backgroundOpacity: number;
  readonly contrastMode: CaptionContrastMode;
  readonly textOutline: CaptionTextOutline;
  readonly captionPosition: CaptionPosition;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly backgroundPaddingHorizontal: number;
  readonly backgroundPaddingVertical: number;
  readonly backgroundRadius: number;
}

export type CaptionAppearanceField = keyof CaptionAppearance;
