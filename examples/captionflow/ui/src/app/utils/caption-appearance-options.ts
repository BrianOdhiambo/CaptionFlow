import {
  CaptionContrastMode,
  CaptionFontFamily,
  CaptionFontWeight,
  CaptionPosition,
  CaptionTextOutline,
} from '../models/caption-appearance.model';
import { SelectOption } from '../models/select-option.model';

export const FONT_FAMILY_OPTIONS: readonly SelectOption<CaptionFontFamily>[] = Object.freeze([
  { value: 'app-default', label: 'App default' },
  { value: 'system-sans', label: 'System sans-serif' },
  { value: 'system-serif', label: 'System serif' },
  { value: 'monospace', label: 'Monospace' },
]);

export const FONT_WEIGHT_OPTIONS: readonly SelectOption<CaptionFontWeight>[] = Object.freeze([
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
]);

export const TEXT_OUTLINE_OPTIONS: readonly SelectOption<CaptionTextOutline>[] = Object.freeze([
  { value: 'none', label: 'None' },
  { value: 'outline', label: 'Outline' },
  { value: 'shadow', label: 'Drop shadow' },
]);

export const POSITION_OPTIONS: readonly SelectOption<CaptionPosition>[] = Object.freeze([
  { value: 'bottom', label: 'Bottom' },
  { value: 'center', label: 'Centre' },
  { value: 'top', label: 'Top' },
]);

export const CONTRAST_MODE_OPTIONS: readonly SelectOption<CaptionContrastMode>[] = Object.freeze([
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High contrast' },
  { value: 'inverted', label: 'Inverted' },
  { value: 'custom', label: 'Custom colours' },
]);
