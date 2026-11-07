import { CaptionAppearance } from './caption-appearance.model';

export const CAPTION_APPEARANCE_PRESET_IDS = [
  'white-on-dark',
  'yellow-on-black',
  'black-on-white',
  'cyan-on-black',
] as const;

export type CaptionAppearancePresetId = (typeof CAPTION_APPEARANCE_PRESET_IDS)[number];

export interface CaptionAppearancePreset {
  readonly id: CaptionAppearancePresetId;
  readonly label: string;
  readonly appearance: CaptionAppearance;
}
